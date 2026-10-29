/* Logika bersama: dipakai proses utama (notifikasi) dan tampilan (dashboard).
 * Semua tanggal ditafsirkan pada zona waktu lokal komputer pengguna. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PTLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  var DEFAULT_START = '09:00';
  var DEFAULT_END = '18:00';
  var OVERPERFORM_RATIO = 0.8; // selesai ≤ deadline dan memakai ≤ 80% durasi rencana
  var HOUR = 36e5;
  // KPI task Artikel: hanya jam kerja Senin–Jumat 09:00–18:00 WIB; toleransi terlambat 2 jam kerja
  var WORK = { startH: 9, endH: 18, tzOffsetMin: 7 * 60, days: [1, 2, 3, 4, 5] };
  var GRACE_MS = 2 * HOUR;
  var STAGES = ['', 'Ditugaskan', 'Menyusun brief', 'Review brief', 'Menulis artikel', 'Review artikel', 'Publish', 'Cek ulang dengan AI', 'Review cek AI', 'Selesai'];
  var REVIEW_STAGES = [3, 5, 8];
  var STAGE_STATUS = ['', 'Backlog', 'On-Progress', 'Review', 'On-Progress', 'Review', 'On-Progress', 'On-Progress', 'Review', 'Done'];

  function isArticle(t) { return String(t && t.type || '').toLowerCase() === 'artikel'; }
  function isRequest(t) { return String(t && t.type || '').toLowerCase() === 'request'; }
  /** KPI request: waktu klarifikasi (pertanyaan penerima → jawaban/terima) dijeda dan menggeser deadline.
   *  Tepat waktu bila pengajuan terakhir ≤ deadline + jeda. Waktu respon = dibuat → terima/klarifikasi pertama. */
  function requestKpi(task, now) {
    now = now || new Date();
    var log = (Array.isArray(task.stageLog) ? task.stageLog : []).map(function (x) { return { e: x.e, t: stamp(x.t) }; })
      .filter(function (x) { return x.e && x.t; }).sort(function (a, b) { return a.t - b.t; });
    var created = null, pauseMs = 0, pausedAt = null, firstResp = null, lastSub = null, doneAt = null, revisions = 0, acceptedAt = null;
    log.forEach(function (x) {
      if (x.e === 'created') { created = x.t; pauseMs = 0; pausedAt = null; firstResp = null; acceptedAt = null; }
      else if (x.e === 'clar') { if (!firstResp) firstResp = x.t; if (!pausedAt) pausedAt = x.t; }
      else if (x.e === 'ans' || x.e === 'acc') {
        if (pausedAt) { pauseMs += x.t - pausedAt; pausedAt = null; }
        if (x.e === 'acc') { if (!firstResp) firstResp = x.t; acceptedAt = x.t; }
      } else if (x.e === 'sub') lastSub = x.t;
      else if (x.e === 'ret') revisions++;
      else if (x.e === 'done') doneAt = x.t;
    });
    var paused = !!pausedAt;
    if (pausedAt) pauseMs += Math.max(now - pausedAt, 0);
    var s = schedule(task), effEnd = s.end ? new Date(s.end.getTime() + pauseMs) : null;
    var done = isDone(task);
    var finish = done ? (lastSub || stamp(task.reviewAt) || doneAt || stamp(task.doneAt)) : null;
    return { created: created, acceptedAt: acceptedAt, responseMs: created && firstResp ? Math.max(firstResp - created, 0) : null,
      pauseMs: pauseMs, paused: paused, effEnd: effEnd, finishAt: finish, revisions: revisions, done: done,
      late: done ? !!(finish && effEnd && finish > effEnd) : !!(effEnd && now > effEnd && task.status !== 'Review' && !paused) };
  }
  function evaluateRequest(task, now) {
    var s = schedule(task), k = requestKpi(task, now);
    var r = { request: true, plannedStart: s.start, plannedEnd: k.effEnd, startedAt: k.acceptedAt, doneAt: stamp(task.doneAt), reviewAt: stamp(task.reviewAt),
      finishAt: k.finishAt, plannedMs: null, durationMs: k.acceptedAt && k.finishAt ? Math.max(k.finishAt - k.acceptedAt, 0) : null,
      slackMs: null, responseMs: k.responseMs, revisions: k.revisions, pauseMs: k.pauseMs, outcome: null };
    if (k.done) { r.slackMs = k.finishAt && k.effEnd ? k.effEnd - k.finishAt : null; r.outcome = k.finishAt && k.effEnd ? (k.late ? 'late' : 'ontime') : 'done-nodate'; }
    else if (task.status === 'Review') r.outcome = 'review';
    else if (k.late) { r.outcome = 'overdue'; r.slackMs = k.effEnd - (now || new Date()); }
    else r.outcome = 'open';
    return r;
  }
  /** Ringkasan KPI kategori Request (per orang penerima). */
  function requestSummary(tasks, range, now) {
    now = now || new Date();
    var from = range && range.from, to = range && range.to;
    var rows = tasks.filter(isRequest).map(function (t) { return { t: t, e: evaluateRequest(t, now) }; }).filter(function (x) {
      var ref = x.e.finishAt || x.e.plannedEnd || stamp(x.t.startDate);
      if (!from && !to) return true;
      if (!ref) return !from;
      return (!from || ref >= from) && (!to || ref <= to);
    });
    var done = rows.filter(function (x) { return isDone(x.t); });
    var judged = done.filter(function (x) { return x.e.outcome === 'ontime' || x.e.outcome === 'late'; });
    var resp = rows.filter(function (x) { return x.e.responseMs !== null; });
    return { rows: rows, total: rows.length, done: done.length,
      ontime: judged.filter(function (x) { return x.e.outcome === 'ontime'; }).length, late: judged.filter(function (x) { return x.e.outcome === 'late'; }).length,
      onTimeRate: judged.length ? judged.filter(function (x) { return x.e.outcome === 'ontime'; }).length / judged.length : null,
      avgResponseMs: resp.length ? resp.reduce(function (a, x) { return a + x.e.responseMs; }, 0) / resp.length : null,
      firstPassRate: done.length ? done.filter(function (x) { return !x.e.revisions; }).length / done.length : null,
      overdue: rows.filter(function (x) { return x.e.outcome === 'overdue'; }).length,
      waiting: rows.filter(function (x) { return !isDone(x.t) && x.e.outcome !== 'overdue'; }).length };
  }
  function stageOf(t) { var n = Number(t && t.stage); return n >= 1 && n <= 9 ? n : (isDone(t) ? 9 : 1); }

  /** Lama jam kerja (ms) di antara a dan b — hanya Senin–Jumat 09:00–18:00 WIB. */
  function workMs(a, b) {
    if (!a || !b || b <= a) return 0;
    var off = WORK.tzOffsetMin * 60000, DAY = 864e5;
    var A = a.getTime() + off, B = b.getTime() + off, total = 0;
    for (var d = Math.floor(A / DAY) * DAY; d < B; d += DAY) {
      if (WORK.days.indexOf(new Date(d).getUTCDay()) < 0) continue;
      var s = Math.max(A, d + WORK.startH * HOUR), e = Math.min(B, d + WORK.endH * HOUR);
      if (e > s) total += e - s;
    }
    return total;
  }

  /** Riwayat tahap: [{s: tahap, t: ISO}] diurutkan waktu. */
  function stageLog(t) {
    var log = t && t.stageLog;
    if (typeof log === 'string') { try { log = JSON.parse(log); } catch (e) { log = []; } }
    return (Array.isArray(log) ? log : []).map(function (x) { return { s: Number(x.s), t: stamp(x.t) }; })
      .filter(function (x) { return x.t; }).sort(function (a, b) { return a.t - b.t; });
  }

  /** KPI satu task Artikel: waktu murni = jam kerja (mulai → selesai/sekarang) − jam kerja selama review admin. */
  function articleKpi(task, now) {
    now = now || new Date();
    var s = schedule(task), log = stageLog(task);
    var assigned = log.length ? log[0].t : (stamp(task.startedAt) || s.start);
    var clockStart = assigned && s.start ? new Date(Math.max(assigned, s.start)) : (assigned || s.start);
    var doneAt = isDone(task) ? (stamp(task.doneAt) || (log.length && log[log.length - 1].s === 9 ? log[log.length - 1].t : null)) : null;
    var endAt = doneAt || now;
    var reviewMs = 0, perStage = {};
    log.forEach(function (x, i) {
      if (REVIEW_STAGES.indexOf(x.s) < 0) return;
      var a = clockStart && x.t < clockStart ? clockStart : x.t;
      var b = i + 1 < log.length ? log[i + 1].t : endAt;
      if (b > endAt) b = endAt;
      var w = workMs(a, b);
      reviewMs += w; perStage[x.s] = (perStage[x.s] || 0) + w;
    });
    var gross = clockStart ? workMs(clockStart, endAt) : null;
    var net = gross === null ? null : Math.max(gross - reviewMs, 0);
    var allowance = s.start && s.end ? workMs(s.start, s.end) : null;
    return { clockStart: clockStart, doneAt: doneAt, grossMs: gross, reviewMs: reviewMs, reviewByStage: perStage, netMs: net, allowanceMs: allowance,
      late: net !== null && allowance !== null && net > allowance + GRACE_MS };
  }

  function at(dateStr, timeStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
    var p = dateStr.split('-').map(Number);
    var t = String(timeStr || '').split(':').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2], t[0] || 0, t[1] || 0, 0, 0);
    return isNaN(d) ? null : d;
  }

  function stamp(s) { if (!s) return null; var d = new Date(s); return isNaN(d) ? null : d; }

  function schedule(task) {
    return {
      start: at(task.startDate, task.startTime || DEFAULT_START),
      end: at(task.endDate, task.endTime || DEFAULT_END)
    };
  }

  function isDone(t) { return String(t.status).toLowerCase() === 'done'; }

  /** Ringkasan performa satu task. */
  function evaluate(task, now) {
    now = now || new Date();
    if (isArticle(task)) return evaluateArticle(task, now);
    if (isRequest(task)) return evaluateRequest(task, now);
    var s = schedule(task);
    var startedAt = stamp(task.startedAt);
    var doneAt = stamp(task.doneAt);
    var reviewAt = stamp(task.reviewAt);
    // waktu selesai = saat anggota mengajukan review (lama review admin tidak dihitung)
    var finishAt = doneAt && reviewAt && reviewAt <= doneAt ? reviewAt : doneAt;
    var actualStart = startedAt || s.start;
    var planned = s.start && s.end ? Math.max(s.end - s.start, 0) : null;
    var r = {
      plannedStart: s.start, plannedEnd: s.end, startedAt: startedAt, doneAt: doneAt, reviewAt: reviewAt, finishAt: finishAt,
      plannedMs: planned, durationMs: null, slackMs: null, outcome: null
    };
    if (isDone(task)) {
      if (finishAt && actualStart) r.durationMs = Math.max(finishAt - actualStart, 0);
      if (finishAt && s.end) {
        r.slackMs = s.end - finishAt; // positif = lebih cepat dari deadline
        if (finishAt > s.end) r.outcome = 'late';
        else if (planned && r.durationMs !== null && r.durationMs <= planned * OVERPERFORM_RATIO) r.outcome = 'over';
        else r.outcome = 'ontime';
      } else {
        r.outcome = 'done-nodate';
      }
    } else if (task.status === 'Review') {
      r.outcome = 'review';
    } else if (s.end && now > s.end && String(task.status) !== 'Recurring') {
      r.outcome = 'overdue';
      r.slackMs = s.end - now;
    } else {
      r.outcome = 'open';
    }
    return r;
  }

  function evaluateArticle(task, now) {
    var s = schedule(task), k = articleKpi(task, now);
    var r = {
      article: true, stage: stageOf(task), plannedStart: s.start, plannedEnd: s.end, startedAt: k.clockStart, doneAt: k.doneAt, reviewAt: stamp(task.reviewAt),
      finishAt: k.doneAt, plannedMs: k.allowanceMs, durationMs: null, slackMs: null, reviewMs: k.reviewMs, reviewByStage: k.reviewByStage,
      netSoFarMs: k.netMs, outcome: null
    };
    if (isDone(task)) {
      r.durationMs = k.netMs;
      if (k.netMs !== null && k.allowanceMs !== null) {
        r.slackMs = k.allowanceMs - k.netMs;
        r.outcome = k.late ? 'late' : (k.netMs <= k.allowanceMs * OVERPERFORM_RATIO ? 'over' : 'ontime');
      } else r.outcome = 'done-nodate';
    } else if (task.status === 'Review') r.outcome = 'review';
    else if (k.late) { r.outcome = 'overdue'; r.slackMs = k.allowanceMs - k.netMs; }
    else r.outcome = 'open';
    return r;
  }

  /** Kelompok tampilan untuk daftar "Task Saya". */
  function bucket(task, now) {
    now = now || new Date();
    if (isDone(task)) return 'done';
    if (task.status === 'Review') return 'review';
    var s = schedule(task);
    if (isArticle(task)) { if (articleKpi(task, now).late) return 'overdue'; }
    else if (isRequest(task)) { var rk = requestKpi(task, now); if (rk.late) return 'overdue'; if (rk.effEnd) s = { start: s.start, end: rk.effEnd }; }
    else if (s.end && now > s.end && task.status !== 'Recurring') return 'overdue';
    if (s.start && s.end && now >= s.start && now <= s.end) return 'today';
    if (s.end && s.end - now <= 24 * HOUR) return 'today';
    if (task.status === 'On-Progress') return 'today';
    if (s.start && s.start > now) return 'upcoming';
    return 'backlog';
  }

  /** Daftar notifikasi yang seharusnya sudah muncul saat ini. */
  function dueNotifications(tasks, opts, now) {
    now = now || new Date();
    var reminders = (opts && opts.reminders) || [1440, 60];
    var out = [];
    tasks.forEach(function (t) {
      if (isDone(t) || t.status === 'Recurring' || t.status === 'Review') return;
      var s = schedule(t);
      if (s.start && now >= s.start && now - s.start < 6 * HOUR && t.status !== 'On-Progress') {
        out.push({ key: t.id + '|start|' + s.start.toISOString(), task: t, type: 'start',
          title: 'Task dimulai sekarang', body: t.task });
      }
      if (s.end) {
        var left = s.end - now;
        reminders.forEach(function (m) {
          if (left > 0 && left <= m * 60000) {
            out.push({ key: t.id + '|due' + m + '|' + s.end.toISOString(), task: t, type: 'due', minutes: m,
              title: 'Deadline ' + humanDuration(left) + ' lagi', body: t.task });
          }
        });
        if (left <= 0 && -left < 24 * HOUR) {
          out.push({ key: t.id + '|overdue|' + s.end.toISOString(), task: t, type: 'overdue',
            title: 'Task melewati deadline', body: t.task });
        }
      }
    });
    // untuk satu task, cukup satu pengingat deadline (yang paling dekat)
    var seen = {};
    return out.sort(function (a, b) {
      if (a.type === 'due' && b.type === 'due' && a.task.id === b.task.id) return a.minutes - b.minutes;
      return a.key < b.key ? -1 : 1;
    }).filter(function (n) {
      if (n.type !== 'due') return true;
      var k = n.task.id;
      if (seen[k]) return false;
      seen[k] = true; return true;
    });
  }

  /** Statistik untuk dashboard. range: {from: Date|null, to: Date|null} */
  function summarize(tasks, range, now) {
    now = now || new Date();
    var from = range && range.from, to = range && range.to;
    var rows = tasks.map(function (t) { return { t: t, e: evaluate(t, now) }; }).filter(function (x) {
      if (!from && !to) return true;
      var ref = x.e.finishAt || x.e.plannedEnd || x.e.plannedStart;
      if (!ref) return !from; // tanpa tanggal hanya ikut di "Semua waktu"
      return (!from || ref >= from) && (!to || ref <= to);
    });
    var k = { total: rows.length, done: 0, over: 0, ontime: 0, late: 0, overdue: 0, open: 0, review: 0,
      durSum: 0, durN: 0, slackSum: 0, slackN: 0, revSum: 0, revN: 0 };
    rows.forEach(function (x) {
      var o = x.e.outcome;
      if (isDone(x.t)) k.done++;
      if (o === 'over') k.over++;
      else if (o === 'ontime') k.ontime++;
      else if (o === 'late') k.late++;
      else if (o === 'overdue') k.overdue++;
      else if (o === 'open') k.open++;
      else if (o === 'review') k.review++;
      if (x.e.durationMs !== null) { k.durSum += x.e.durationMs; k.durN++; }
      if (isDone(x.t) && x.e.slackMs !== null) { k.slackSum += x.e.slackMs; k.slackN++; }
      if (x.e.article && isDone(x.t)) { k.revSum += x.e.reviewMs || 0; k.revN++; }
    });
    var judged = k.over + k.ontime + k.late;
    return {
      rows: rows,
      total: k.total, done: k.done, over: k.over, ontime: k.ontime, late: k.late,
      overdue: k.overdue, open: k.open, review: k.review,
      completionRate: k.total ? k.done / k.total : 0,
      onTimeRate: judged ? (k.over + k.ontime) / judged : null,
      avgDurationMs: k.durN ? k.durSum / k.durN : null,
      avgSlackMs: k.slackN ? k.slackSum / k.slackN : null,
      articleDone: k.revN, avgReviewMs: k.revN ? k.revSum / k.revN : null
    };
  }

  function byPerson(tasks, range, now) {
    var groups = {};
    tasks.forEach(function (t) {
      var key = t.owner || '-';
      (groups[key] = groups[key] || { owner: key, name: t.ownerName || key, tasks: [] }).tasks.push(t);
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      var s = summarize(g.tasks, range, now);
      s.owner = g.owner; s.name = g.name;
      return s;
    });
  }

  function humanDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '–';
    var neg = ms < 0; ms = Math.abs(ms);
    var min = Math.round(ms / 60000), out;
    if (min < 60) out = min + ' menit';
    else if (min < 48 * 60) { var h = Math.floor(min / 60), m = min % 60; out = h + ' jam' + (m && h < 10 ? ' ' + m + ' mnt' : ''); }
    else { var d = Math.floor(min / 1440), hh = Math.round((min % 1440) / 60); out = d + ' hari' + (hh ? ' ' + hh + ' jam' : ''); }
    return (neg ? '-' : '') + out;
  }

  /** Durasi jam kerja: 1 hari kerja = 9 jam. */
  function humanWork(ms) {
    if (ms === null || ms === undefined || isNaN(ms)) return '–';
    var neg = ms < 0; ms = Math.abs(ms);
    var min = Math.round(ms / 60000), dayMin = (WORK.endH - WORK.startH) * 60, out;
    if (min < 60) out = min + ' menit';
    else if (min < dayMin) { var h = Math.floor(min / 60), m = min % 60; out = h + ' jam' + (m ? ' ' + m + ' mnt' : ''); }
    else { var d = Math.floor(min / dayMin), hh = Math.round((min % dayMin) / 60); out = d + ' hari kerja' + (hh ? ' ' + hh + ' jam' : ''); }
    return (neg ? '-' : '') + out;
  }

  return {
    WORK: WORK, GRACE_MS: GRACE_MS, STAGES: STAGES, REVIEW_STAGES: REVIEW_STAGES, STAGE_STATUS: STAGE_STATUS,
    isArticle: isArticle, isRequest: isRequest, requestKpi: requestKpi, evaluateRequest: evaluateRequest, requestSummary: requestSummary, stageOf: stageOf, workMs: workMs, stageLog: stageLog, articleKpi: articleKpi, humanWork: humanWork,
    DEFAULT_START: DEFAULT_START, DEFAULT_END: DEFAULT_END, OVERPERFORM_RATIO: OVERPERFORM_RATIO,
    at: at, schedule: schedule, evaluate: evaluate, bucket: bucket, isDone: isDone,
    dueNotifications: dueNotifications, summarize: summarize, byPerson: byPerson,
    humanDuration: humanDuration
  };
});

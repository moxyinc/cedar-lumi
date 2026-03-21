var scorm = pipwerks.SCORM;

function init() {
  var ok = scorm.init();
  console.log('[h5p-adaptor] scorm.init():', ok, '| version:', scorm.version);
}

function set(param, value) {
  scorm.set(param, value);
}

function get(param) {
  scorm.get(param);
}

function end() {
  scorm.quit();
}

window.onload = function () {
  init();
};

window.onunload = function () {
  end();
};

var onCompleted = function (result) {
  console.log('[h5p-adaptor] onCompleted called, result:', JSON.stringify(result));
  var masteryScore;
  if (scorm.version == '2004') {
    masteryScore = scorm.get('cmi.scaled_passing_score');
  } else if (scorm.version == '1.2') {
    masteryScore = scorm.get('cmi.student_data.mastery_score') / 100;
  }

  if (result.score) {
    scorm.set('cmi.core.score.raw', result.score.scaled * 100);
    scorm.set('cmi.core.score.min', '0');
    scorm.set('cmi.core.score.max', '100');
  }

  if (!result.score || masteryScore === undefined || isNaN(masteryScore)) {
    console.log('[h5p-adaptor] setting status: completed');
    scorm.status('set', 'completed');
  } else {
    var passed = result.score.scaled >= masteryScore;
    if (scorm.version == '2004') {
      scorm.status('set', 'completed');
      scorm.set('cmi.success_status', passed ? 'passed' : 'failed');
    } else if (scorm.version == '1.2') {
      console.log('[h5p-adaptor] setting status:', passed ? 'passed' : 'failed');
      scorm.status('set', passed ? 'passed' : 'failed');
    }
  }
};

// Debug: log H5P instance count
console.log('[h5p-adaptor] H5P.instances count:', (H5P.instances || []).length);

// Hook xAPI events via H5P.instances (instances are created synchronously during H5P.init)
(H5P.instances || []).forEach(function (instance, i) {
  console.log('[h5p-adaptor] attaching xAPI listener to instance', i, instance);
  H5P.on(instance, 'xAPI', function (event) {
    var stmt = event.data.statement;
    var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';
    console.log('[h5p-adaptor] xAPI event verb:', verbId, '| has result:', !!stmt.result);
    if ((verbId === 'completed' || verbId === 'answered') && stmt.result) {
      onCompleted(stmt.result);
    }
  });
});

// Also hook externalDispatcher as a fallback (xAPI events are external:true so this fires too)
H5P.externalDispatcher.on('xAPI', function (event) {
  var stmt = event.data.statement;
  var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';
  console.log('[h5p-adaptor] externalDispatcher xAPI verb:', verbId, '| has result:', !!stmt.result);
});

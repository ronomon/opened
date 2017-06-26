var Node = {
  fs: require('fs'),
  path: require('path'),
  process: process
};
var random = Math.random.bind(Math);
var Queue = require('@ronomon/queue');

var namespace = 'Opened';

var Test = {};

Test.equal = function(value, expected, namespace, description) {
  value = JSON.stringify(value) + '';
  expected = JSON.stringify(expected) + '';
  if (value === expected) {
    Test.pass(namespace, description, expected);
  } else {
    Test.fail(namespace, description, value + ' !== ' + expected);
  }
};

Test.fail = function(namespace, description, message) {
  console.log('');
  throw 'FAIL: ' + Test.message(namespace, description, message);
};

Test.message = function(namespace, description, message) {
  if ((namespace = namespace || '')) namespace += ': ';
  if ((description = description || '')) description += ': ';
  return namespace + description + (message || '');
};

Test.pass = function(namespace, description, message) {
  console.log('PASS: ' + Test.message(namespace, description, message));
};

var root = Node.path.resolve(module.filename, '..');
if (!root) throw new Error('root must not be empty');

var fixtures = Node.path.join(root, 'opened_fixtures');

var binding = require(Node.path.join(root, 'index.js'));

var ALPHABET = '';
ALPHABET += 'abcdefghijklmnopqrstuvwxyz';
ALPHABET += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
ALPHABET += '0123456789';
ALPHABET += 'àáâäæãåāèéêëēėę';
ALPHABET += '\b\f\t\n\r   ';

function close(fds) {
  fds.forEach(
    function(fd) {
      Node.fs.closeSync(fd);
    }
  );
}

function createPath(path) {
  Node.fs.writeFileSync(path, '');
}

function createPaths(paths) {
  paths.forEach(
    function(path) {
      createPath(path);
    }
  );
}

function generatePath() {
  var chars = 1 + Math.floor(random() * 16);
  var string = '';
  while (string.length < chars) {
    string += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (string.trim() === string) continue;
    string += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (string.trim() === string) continue;
    string += ALPHABET[Math.floor(random() * ALPHABET.length)];
    string = string.trim(); // Avoid leading/trailing space on Windows.
  }
  if (random() < 0.5) {
    if (random() < 0.5) {
      string = string.normalize('NFC');
    } else {
      string = string.normalize('NFD');
    }
  }
  return Node.path.join(fixtures, string);
}

function generatePaths() {
  var paths = [];
  var keys = {};
  if (random() < 0.01) return paths;
  var length = Math.floor(random() * 128);
  while (length--) {
    var path = generatePath();
    var key = path.toUpperCase().normalize('NFC');
    if (keys.hasOwnProperty(key)) continue;
    keys[key] = 1;
    paths.push(path);
  }
  return paths;
}

function openPath(path, expect, fds) {
  if (random() < 0.5) {
    expect[path] = false;
  } else {
    expect[path] = true;
    fds.push(Node.fs.openSync(path, 'r+'));
  }
}

function openPaths(paths, expect, fds) {
  paths.forEach(
    function(path) {
      openPath(path, expect, fds);
    }
  );
}

function removeFixtures(callback) {
  function remove() {
    try {
      var names = Node.fs.readdirSync(fixtures);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      var names = [];
    }
    names.forEach(
      function(name) {
        Node.fs.unlinkSync(Node.path.join(fixtures, name));
      }
    );
    try {
      Node.fs.rmdirSync(fixtures);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (callback) {
    setTimeout(
      function() {
        remove();
        callback();
      },
      // Wait for handles to be released by antivirus:
      Node.process.platform === 'win32' ? 2000 : 0
    );
  } else {
    remove();
  }
}

function removePath(path) {
  try {
    Node.fs.unlinkSync(path, '');
  } catch (error) {
    // Ignore
  }
}

function removePaths(paths) {
  paths.forEach(
    function(path) {
      removePath(path);
    }
  );
}

removeFixtures();

try {
  Node.fs.mkdirSync(fixtures);
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

var count = 0;
var elapsed = 0;
var maxCount = 0;
var maxBatch = 0;
var queue = new Queue(1);
queue.onData = function(test, end) {
  var paths = generatePaths();
  var expect = {};
  var fds = [];
  createPaths(paths);
  openPaths(paths, expect, fds);
  var enoent = false;
  if (random() < 0.2) {
    enoent = generatePath();
    paths.push(enoent);
  }
  var now = Date.now();
  binding.files(paths,
    function(error, actual) {
      var time = Date.now() - now;
      count += paths.length;
      elapsed += time;
      if (time > maxBatch) {
        maxCount = paths.length;
        maxBatch = time;
      }
      try {
        if (enoent) {
          Test.equal(error.code, 'ENOENT', namespace, 'error');
          close(fds);
          removePaths(paths);
          return end();
        } else {
          Test.equal(error === undefined, true, namespace, 'error undefined');
        }
        if (error) throw error;
        for (var a in actual) {
          Test.equal(
            expect.hasOwnProperty(a),
            true,
            namespace,
            JSON.stringify(a) + ': name'
          );
          Test.equal(
            actual[a],
            expect[a],
            namespace,
            JSON.stringify(a) + ': open'
          );
        }
        var x = Object.keys(actual).sort().join('');
        var y = Object.keys(expect).sort().join('');
        if (y !== x) {
          Test.equal(x, y, namespace, 'names');
        }
      } catch (error) {
        close(fds);
        removePaths(paths);
        return end(error);
      }
      close(fds);
      removePaths(paths);
      end();
    }
  );
};
queue.onEnd = function(error) {
  removeFixtures(
    function() {
      if (error) throw error;
      var avg = (elapsed / count).toFixed(5);
      console.log(
        avg + 'ms per file, ' + maxBatch + 'ms per ' + maxCount + ' file batch.'
      );
      console.log('================');
      console.log('PASSED ALL TESTS');
      console.log('================');
    }
  );
};
for (var test = 0; test < 10; test++) {
  queue.push(test);
}
queue.end();

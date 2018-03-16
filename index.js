'use strict';

var Node = {
  child: require('child_process'),
  fs: require('fs'),
  path: require('path'),
  process: process
};

var Queue = require('@ronomon/queue');

function assertFunction(key, value) {
  if (typeof value !== 'function') {
    throw new Error(key + ' must be a function');
  }
}

function assertPath(key, value) {
  if (typeof value !== 'string') {
    throw new Error(key + ' must be a string');
  }
  if (value.length === 0) {
    throw new Error(key + ' must not be empty');
  }
  if (value.indexOf('\u0000') !== -1) {
    throw new Error(key + ' must be a string without null bytes');
  }
  if (value.indexOf(assertPathBadSep) !== -1) {
    throw new Error(key + ' must be a string without ' + assertPathBadSepName);
  }
}

if (Node.process.platform === 'win32') {
  var assertPathBadSep = '\/';
  var assertPathBadSepName = 'forward slashes';
} else {
  var assertPathBadSep = '\\';
  var assertPathBadSepName = 'backslashes';
}

function assertPaths(key, value) {
  if (!value || value.constructor !== Array) {
    throw new Error(key + ' must be an array');
  }
  for (var index = 0, length = value.length; index < length; index++) {
    assertPath('path at index ' + index, value[index]);
  }
}

function pathBuffer(path) {
  var pathLong = Node.path._makeLong(path);
  var buffer = Buffer.alloc(Buffer.byteLength(pathLong, 'utf-8') + 1);
  buffer.write(pathLong, 0, buffer.length - 1, 'utf-8');
  buffer[buffer.length - 1] = 0;
  if (buffer.indexOf(0) !== buffer.length - 1) {
    throw new Error('path must be a string without null bytes');
  }
  return buffer;
}

var Unix = {};

Unix.file = function(path, end) {
  var self = this;
  assertPath('path', path);
  assertFunction('end', end);
  self.files([path],
    function(error, files) {
      if (error) return end(error);
      end(undefined, files[path]);
    }
  );
};

Unix.files = function(paths, end) {
  var self = this;
  assertPaths('paths', paths);
  assertFunction('end', end);
  var files = {};
  var queue = new Queue(1); // Concurrency yields no improvement with lsof.
  queue.onData = function(paths, end) {
    var escapedPaths = paths.map(
      function(path) {
        return '"' + path.replace(/"/g, '\\"') + '"';
      }
    );
    var command = 'lsof -F n -- ' + escapedPaths.join(' ');
    var options = {
      encoding: 'utf-8',
      maxBuffer: 2 * 1024 * 1024
    };
    Node.child.exec(command, options,
      function(error, stdout, stderr) {
        // lsof returns an error and a status code of 1 if a file is not open:
        if (error && error.code === 1 && stderr.length === 0) error = undefined;
        if (error) {
          if (/No such file or directory/i.test(stderr)) {
            error.code = 'ENOENT';
          }
          return end(error);
        }
        var lines = stdout.split('\n');
        for (var index = 0, length = lines.length; index < length; index++) {
          var line = lines[index];
          if (line[0] != 'n') continue;
          var candidate = self.unescape(line.slice(1));
          if (files.hasOwnProperty(candidate)) files[candidate] = true;
        }
        end();
      }
    );
  };
  queue.onEnd = function(error) {
    if (error) return end(error);
    end(undefined, files);
  };
  // lsof performs in constant time regardless of the number of paths.
  // We therefore batch calls to lsof to improve latency.
  // We must be careful however not to exceed any limits on command length.
  // 32 paths at 32768 bytes per path requires just over 1 MB.
  // We assume we are safe up to 2 MB.
  // See: xargs --show-limits
  var batch = [];
  for (var index = 0, length = paths.length; index < length; index++) {
    var path = paths[index];
    if (files.hasOwnProperty(path)) continue;
    files[path] = false;
    batch.push(path);
    if (batch.length === 32) {
      queue.push(batch);
      batch = [];
    }
  }
  if (batch.length) queue.push(batch);
  queue.end();
};

Unix.unescape = function(sourceString) {
  var self = this;
  var source = Buffer.from(sourceString, 'utf-8');
  var target;
  var targetIndex;
  var sourceIndex = 0;
  var sourceLength = source.length;
  while (sourceIndex < sourceLength) {
    if (source[sourceIndex] === 92 && sourceIndex + 1 < sourceLength) { // "\\"
      if (!target) {
        target = Buffer.alloc(sourceLength);
        targetIndex = source.copy(target, 0, 0, sourceIndex);
      }
      sourceIndex++;
      target[targetIndex++] = self.unescapeTable[source[sourceIndex++]];
    } else if (target) {
      target[targetIndex++] = source[sourceIndex++];
    } else {
      sourceIndex++;
    }
  }
  if (target) {
    return target.toString('utf-8', 0, targetIndex);
  } else {
    return sourceString;
  }
};

Unix.unescapeTable = (function() {
  var table = Buffer.alloc(256);
  for (var code = 0; code < 256; code++) table[code] = code;
  table['b'.charCodeAt(0)] = '\b'.charCodeAt(0);
  table['f'.charCodeAt(0)] = '\f'.charCodeAt(0);
  table['t'.charCodeAt(0)] = '\t'.charCodeAt(0);
  table['n'.charCodeAt(0)] = '\n'.charCodeAt(0);
  table['r'.charCodeAt(0)] = '\r'.charCodeAt(0);
  return table;
})();

var Windows = {};

// See: https://msdn.microsoft.com/en-us/library/windows/desktop/ms681382.aspx
Windows.codes = {
  1: 'EISDIR', // ERROR_INVALID_FUNCTION
  2: 'ENOENT', // ERROR_FILE_NOT_FOUND
  3: 'ENOENT', // ERROR_PATH_NOT_FOUND
  4: 'EMFILE', // ERROR_TOO_MANY_OPEN_FILES
  5: 'EPERM', // ERROR_ACCESS_DENIED
  6: 'EBADF', // ERROR_INVALID_HANDLE
  8: 'ENOMEM', // ERROR_NOT_ENOUGH_MEMORY
  14: 'ENOMEM', // ERROR_OUTOFMEMORY
  15: 'ENOENT', // ERROR_INVALID_DRIVE
  32: 'ERROR_SHARING_VIOLATION',
  33: 'ERROR_LOCK_VIOLATION'
};

if (Node.process.platform === 'win32') {
  Windows.binding = require('./binding.node');
}

Windows.file = function(path, end) {
  var self = this;
  assertPath('path', path);
  assertFunction('end', end);
  self.binding.opened(pathBuffer(path),
    function(result) {
      if (result === 0) return end(undefined, false);
      if (self.codes.hasOwnProperty(result)) {
        var code = self.codes[result];
      } else {
        var code = 'ENOSYS';
      }
      if (
        code === 'ERROR_SHARING_VIOLATION' ||
        code === 'ERROR_LOCK_VIOLATION'
      ) {
        return end(undefined, true);
      }
      var error = new Error(code + ': -' + result + ', opened(' + path + ')');
      error.code = code;
      end(error);
    }
  );
};

Windows.files = function(paths, end) {
  var self = this;
  assertPaths('paths', paths);
  assertFunction('end', end);
  var files = {};
  var queue = new Queue(4);
  queue.onData = function(path, end) {
    self.file(path,
      function(error, opened) {
        if (error) return end(error);
        if (opened) files[path] = true;
        end();
      }
    );
  };
  queue.onEnd = function(error) {
    if (error) return end(error);
    end(undefined, files);
  };
  for (var index = 0, length = paths.length; index < length; index++) {
    var path = paths[index];
    if (files.hasOwnProperty(path)) continue;
    files[path] = false;
    queue.push(path);
  }
  queue.end();
};

if (Node.process.platform === 'win32') {
  module.exports = Windows;
} else {
  module.exports = Unix;
}

// S.D.G.

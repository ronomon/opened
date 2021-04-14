const assert = require('assert');
const fs = require('fs');

const Opened = require('./index.js');

const paths = ['$(touch command_line_injection)'];

Opened.files(paths,
  function(error, hashTable) {
    assert(!!error);
    assert(fs.existsSync('command_line_injection') === false);
    console.log('PASS');
  }
);


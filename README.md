# utimes
Check if a file is open in another application on Windows, macOS and Linux. Linux requires privileges.

## Installation
```
npm install @ronomon/opened
```

## Usage

```javascript
var Opened = require('@ronomon/opened');
var paths = [...];
Opened.files(paths,
  function(error, hashTable) {
    if (error) throw error;
    paths.forEach(
      function(path) {
        console.log(path + ' open=' + hashTable.hasOwnProperty(path));
      }
    );
  }
);
```

## Tests
```
node test.js
```

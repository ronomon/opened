# opened
Check if a file is open in another application on Windows, macOS and Linux. Linux requires privileges.

## Installation
```
npm install @ronomon/opened
```

## Windows
`Opened` uses a native binding on Windows to try and open an existing file with exclusive sharing mode (`dwShareMode`) and detect an `ERROR_SHARING_VIOLATION` error if another application already has an open handle to the file. This will detect any applications with open handles to the file, but not applications which have opened, buffered the file for display, and then closed the handle (i.e. applications which may be showing the file to the user, but which no longer have an open handle to the file).

## Unix
`Opened` uses `lsof` on macOS and on Linux. On Linux (but not on macOS), `lsof` requires sudo permissions to iterate across open file descriptors for the user, otherwise no files will be detected as open and no permissions error will be returned.

## Usage

```javascript
var Opened = require('@ronomon/opened');
var paths = [...];
Opened.files(paths,
  function(error, hashTable) {
    if (error) throw error;
    paths.forEach(
      function(path) {
        console.log(path + ' open=' + hashTable[path]);
      }
    );
  }
);
```

## Tests
```
node test.js
```

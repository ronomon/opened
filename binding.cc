#include <nan.h>
#if defined(_WIN32)
#include <io.h>
#include <windows.h>
#endif

int open(const char* path) {
#if defined(_WIN32)
  int chars = MultiByteToWideChar(CP_UTF8, 0, path, -1, NULL, 0);
  if (chars == 0) return GetLastError();
  WCHAR* pathw = (WCHAR*) malloc(chars * sizeof(WCHAR));
  if (pathw == NULL) return ERROR_OUTOFMEMORY;
  MultiByteToWideChar(CP_UTF8, 0, path, -1, pathw, chars);
  HANDLE handle = CreateFileW(
    pathw,
    FILE_GENERIC_READ | FILE_GENERIC_WRITE,
    0L,
    NULL,
    OPEN_EXISTING,
    NULL,
    NULL
  );
  free(pathw);
  if (handle == INVALID_HANDLE_VALUE) return GetLastError();
  CloseHandle(handle);
  return 0;
#else
  return -1;
#endif
}

class OpenWorker : public Nan::AsyncWorker {
 public:
  OpenWorker(
    v8::Local<v8::Object> &pathHandle,
    Nan::Callback *callback
  ) : Nan::AsyncWorker(callback) {
        SaveToPersistent("pathHandle", pathHandle);
        path = node::Buffer::Data(pathHandle);
  }

  ~OpenWorker() {}

  void Execute() {
    error = open(path);
  }

  void HandleOKCallback () {
    Nan::HandleScope scope;
    v8::Local<v8::Value> argv[] = {
      Nan::New<v8::Number>(error)
    };
    callback->Call(1, argv);
  }

 private:
  const char* path;
  int error;
};

NAN_METHOD(opened) {
  if (
    info.Length() != 2 ||
    !node::Buffer::HasInstance(info[0]) ||
    !info[1]->IsFunction()
  ) {
    return Nan::ThrowError(
      "bad arguments, expected: (buffer path, function callback)"
    );
  }
  v8::Local<v8::Object> pathHandle = info[0].As<v8::Object>();
  Nan::Callback *callback = new Nan::Callback(info[1].As<v8::Function>());
  Nan::AsyncQueueWorker(new OpenWorker(pathHandle, callback));
}

NAN_MODULE_INIT(Init) {
  NAN_EXPORT(target, opened);
}

NODE_MODULE(binding, Init)

// S.D.G.

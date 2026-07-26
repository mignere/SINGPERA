#!/usr/bin/env python3
"""Authenticate against Linux PAM via libpam.so (no extra Python packages)."""

import ctypes
import ctypes.util
import json
import sys


class PamHandle(ctypes.Structure):
    _fields_ = [("handle", ctypes.c_void_p)]


class PamMessage(ctypes.Structure):
    _fields_ = [
        ("msg_style", ctypes.c_int),
        ("msg", ctypes.c_char_p),
    ]


class PamResponse(ctypes.Structure):
    _fields_ = [
        ("resp", ctypes.c_char_p),
        ("resp_retcode", ctypes.c_int),
    ]


CONV_FUNC = ctypes.CFUNCTYPE(
    ctypes.c_int,
    ctypes.c_int,
    ctypes.POINTER(ctypes.POINTER(PamMessage)),
    ctypes.POINTER(ctypes.POINTER(PamResponse)),
    ctypes.c_void_p,
)


class PamConv(ctypes.Structure):
    _fields_ = [
        ("conv", CONV_FUNC),
        ("appdata_ptr", ctypes.c_void_p),
    ]


PAM_SUCCESS = 0
PAM_PROMPT_ECHO_OFF = 1
PAM_PROMPT_ECHO_ON = 2
PAM_ERROR_MSG = 3
PAM_TEXT_INFO = 4


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except Exception:
        print("ERR", file=sys.stderr)
        return 2

    username = payload.get("username") or ""
    password = payload.get("password") or ""
    service = (payload.get("service") or "login").encode("utf-8")

    if not username or not password:
        print("FAIL")
        return 1

    libname = ctypes.util.find_library("pam") or "libpam.so.0"
    try:
        libpam = ctypes.CDLL(libname)
    except OSError as exc:
        print(f"cannot load PAM library: {exc}", file=sys.stderr)
        return 2

    password_bytes = password.encode("utf-8")

    @CONV_FUNC
    def conv(num_msg, msg, resp, appdata):
        if num_msg <= 0:
            return 1
        # Allocate response array that PAM will free with free()
        libc = ctypes.CDLL(ctypes.util.find_library("c") or "libc.so.6")
        size = ctypes.sizeof(PamResponse) * num_msg
        raw = libc.calloc(num_msg, ctypes.sizeof(PamResponse))
        if not raw:
            return 1
        arr = ctypes.cast(raw, ctypes.POINTER(PamResponse))
        for i in range(num_msg):
            style = msg[i].contents.msg_style
            if style in (PAM_PROMPT_ECHO_OFF, PAM_PROMPT_ECHO_ON):
                buf = libc.malloc(len(password_bytes) + 1)
                if not buf:
                    return 1
                ctypes.memmove(buf, password_bytes, len(password_bytes))
                ctypes.memset(buf + len(password_bytes), 0, 1)
                arr[i].resp = ctypes.cast(buf, ctypes.c_char_p)
                arr[i].resp_retcode = 0
            else:
                arr[i].resp = None
                arr[i].resp_retcode = 0
        resp[0] = arr
        return PAM_SUCCESS

    handle = PamHandle()
    conversation = PamConv(conv, None)

    libpam.pam_start.restype = ctypes.c_int
    libpam.pam_start.argtypes = [
        ctypes.c_char_p,
        ctypes.c_char_p,
        ctypes.POINTER(PamConv),
        ctypes.POINTER(PamHandle),
    ]
    libpam.pam_authenticate.restype = ctypes.c_int
    libpam.pam_authenticate.argtypes = [PamHandle, ctypes.c_int]
    libpam.pam_acct_mgmt.restype = ctypes.c_int
    libpam.pam_acct_mgmt.argtypes = [PamHandle, ctypes.c_int]
    libpam.pam_end.restype = ctypes.c_int
    libpam.pam_end.argtypes = [PamHandle, ctypes.c_int]

    rc = libpam.pam_start(service, username.encode("utf-8"), ctypes.byref(conversation), ctypes.byref(handle))
    if rc != PAM_SUCCESS:
        print("FAIL")
        return 1

    rc = libpam.pam_authenticate(handle, 0)
    if rc == PAM_SUCCESS:
        rc = libpam.pam_acct_mgmt(handle, 0)

    libpam.pam_end(handle, rc)

    if rc == PAM_SUCCESS:
        print("OK")
        return 0

    print("FAIL")
    return 1


if __name__ == "__main__":
    sys.exit(main())

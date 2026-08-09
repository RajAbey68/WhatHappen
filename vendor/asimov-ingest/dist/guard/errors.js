"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UploadGuardError = void 0;
class UploadGuardError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'UploadGuardError';
        this.code = code;
    }
}
exports.UploadGuardError = UploadGuardError;

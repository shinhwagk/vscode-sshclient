import * as path from 'path';
import { platform } from 'os';

export const join = platform() === 'win32' ? path.win32.join : path.join;

// var replace = "regex";
// var re = new RegExp(replace,"g");
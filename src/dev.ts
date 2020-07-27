import * as vscode from 'vscode';

export function vsPrint(message: string) {
    vscode.window.showInformationMessage(message);
}
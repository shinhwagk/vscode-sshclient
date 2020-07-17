import * as vscode from 'vscode';


export async function createTerminal(host: string) {
    const t = vscode.window.createTerminal(`VT@${host}@${Math.ceil(Math.random() * 100)}`);
    t.show()
    t.sendText(`ssh ${host}`, true);
    return t
}

export async function initTermainl(terminal: vscode.Terminal) {

}

export class VTTerminalManager {
    currentHost: string = "";
    createTerminal(host: string) {
        const t = vscode.window.createTerminal(host)
        t.sendText(`ssh root@${host}`)
        t.show()
    }
    query(host?: string): vscode.Terminal[] {
        if (host) {
            return vscode.window.terminals.filter(t => /^VT@/.test(t.name)).filter(t => t.name.includes(host))
        }
        return vscode.window.terminals.filter(t => /^VT@/.test(t.name)).filter(t => t.name.includes(this.currentHost))
    }

    checkActiveTerminalByHost(host: string): boolean {
        return this.checkHostConnectNumber(host).length === 0
    }
    checkHostConnectNumber(host: string): vscode.Terminal[] {
        const regex = `^VT@${host}@`
        var re = new RegExp(regex);
        return vscode.window.terminals.filter(t => re.test(t.name))
    }
}
// function checkTerminalPasswordEnter(t: vscode.Terminal): boolean {
//     vscode.window.ter
//     return 
// }
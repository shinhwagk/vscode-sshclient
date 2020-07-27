import * as vscode from 'vscode';
import { vsPrint } from './dev';


// export async function createTerminal(host: string) {
//     const t = vscode.window.createTerminal(`VT@${host}@${Math.ceil(Math.random() * 100)}`);
//     t.show()
//     t.sendText(`ssh ${host}`, true);
//     return t
// }

export async function initTermainl(terminal: vscode.Terminal) {

}

export class VTTerminalManager {
    prefix = "VSHC";
    prefixRegex = new RegExp(`^${this.prefix}`);
    prefixHostRegex = new RegExp(`^${this.prefix}@H@`);
    prefixHostGroupRegex = new RegExp(`^${this.prefix}@G@`);
    hostTerminalNameRegex = new RegExp(`^${this.prefix}@H@(\\w+) | (\\d+)`);

    private obtainTerminalName(kind: 'host' | 'group', host: string) {
        const k = kind === 'host' ? 'H' : 'G';
        return `${this.prefix}@${k}@${host}`;
    }
    currentHost: string = "";

    createTerminal(host: string, kind?: 'host' | 'group') {
        const terminalName = this.obtainTerminalName('host', host);
        const seq = Math.ceil(Math.random() * 100);
        const t = vscode.window.createTerminal(terminalName + ` | ${seq}`);
        t.sendText(`ssh ${host}`);
        t.show();
        return t;
    }
    query(host?: string): vscode.Terminal[] {
        if (host) {
            return vscode.window.terminals.filter(t => this.prefixRegex.test(t.name)).filter(t => t.name.includes(host));
        }
        return vscode.window.terminals.filter(t => this.prefixRegex.test(t.name)).filter(t => t.name.includes(this.currentHost));
    }

    getHostTerminal(host: string): vscode.Terminal | undefined {
        const terminal = vscode.window.terminals.filter(t => this.prefixHostRegex.test(this.obtainTerminalName('host', host)));
        if (terminal.length >= 1) {
            return terminal[0];
        }
        return undefined;
    }

    getHostGroupTerminal() {

    }

    getTerminalByhost(host: string): vscode.Terminal | undefined {
        const ts = vscode.window.terminals.filter(t => this.prefixRegex.test(t.name)).filter(t => t.name.includes(host));
        if (ts.length >= 1) {
            return ts[0];
        }
        return undefined;
    }

    checkActiveTerminalByHost(host: string): boolean {
        return this.checkHostConnectNumber(host).length === 0;
    }

    checkHostConnectNumber(host: string): vscode.Terminal[] {
        return vscode.window.terminals.filter(t => new RegExp(`^${this.prefix}@H@${host} \\|`).test(t.name));
    }

    checkHostTerminalExistByNamePrefix(tname: string): boolean {
        return this.prefixHostRegex.test(tname);
    }

    parserTerminalName(name: string): { host: string, seq: string } {
        const rs = this.hostTerminalNameRegex.exec(name)!;
        // if (rs) {
        return { host: rs[1], seq: rs[2] };
        // }
        // return undefined
    }
}
// function checkTerminalPasswordEnter(t: vscode.Terminal): boolean {
//     vscode.window.ter
//     return 
// }
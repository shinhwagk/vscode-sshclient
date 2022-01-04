import * as path from 'path';
import { homedir } from 'os';
import { join, basename } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';

import * as vscode from 'vscode';
import { TreeItem, TreeDataProvider, Uri, EventEmitter, Event } from 'vscode';

import { readdirSync, statSync, mkdirpSync, ensureFileSync } from 'fs-extra';
const SSHConfig = require('ssh-config');

import * as helper from './helper';
import { VTTerminalManager } from './terminal';
import { vsPrint } from './dev';


function readSSHConfig(sshConfigPath?: string) {
	const sshconfigfile = helper.join(sshConfigPath || path.join(homedir(), '.ssh', 'config'));
	return readFileSync(sshconfigfile, { encoding: 'utf-8' });
}

// function getConfigure<T>(name: string, defaultValue?: T): T | undefined {
// 	return vscode.workspace.getConfiguration('vscode-sshclient').get(name) || defaultValue;
// }

async function configureSshConfig() {
	const sshConfigFile = vscode.workspace.getConfiguration('vscode-sshclient').get<string>('SSH.mirrorFile');
	const cf = sshConfigFile || helper.join(homedir(), '.ssh', 'config');
	// @ext:ms-vscode-remote.remote-ssh,ms-vscode-remote.remote-ssh-edit config file
	// const pick = await vscode.window.showQuickPick([defutlSSHConfig, 'Settings']);
	// if (!pick) { return; }

	mkdirpSync(path.dirname(cf));
	ensureFileSync(cf);
	const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(cf));
	await vscode.languages.setTextDocumentLanguage(doc, 'ssh_config');
	const x = await vscode.window.showTextDocument(doc);
	// x.
	ext.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
		if (doc.uri.fsPath === cf) {
			initializeSshConcfig();
			ext.vtHostProvider.refresh();
		}
	}));
}

function initializeExtensionDirectory() {
	const hdc = vscode.workspace.getConfiguration('vscode-sshclient').get<string>('workspace');
	const hd = hdc || path.join(homedir(), 'vscode-sshclient');
	const dpath = hd.startsWith('~/') ? join(homedir(), hd.substr(2)) : hd;
	ext.vtHosthostpadDirectory = dpath;
	mkdirpSync(dpath);
	mkdirpSync(helper.join(dpath, 'hosts'));
	mkdirpSync(helper.join(dpath, 'groups'));
}

function initializeSshConcfig() {
	const sshConfigFile = vscode.workspace.getConfiguration('vscode-sshclient').get<string>('SSH.mirrorFile');
	if (sshConfigFile) {
		if (existsSync(sshConfigFile)) {
			ext.sshConfig = SSHConfig.parse(readSSHConfig(sshConfigFile));
		}
	} else {
		ext.sshConfig = SSHConfig.parse(readSSHConfig());
		// if (existsSync(helper.join(homedir(), '.ssh', 'config'))) {
		// 	vscode.window.showInformationMessage(readFileSync(helper.join(homedir(), '.ssh', 'config'), { encoding: 'utf-8' }));
		// 	ext.sshConfig = SSHConfig.parse(readFileSync(helper.join(homedir(), '.ssh', 'config'), { encoding: 'utf-8' }));
		// }
	}
}

function initializeExtensionVariables(ctx: vscode.ExtensionContext): void {
	ext.context = ctx;
	initializeExtensionDirectory();
	ext.vthostView = vscode.window.createTreeView('vthostExplorer', { treeDataProvider: ext.vtHostProvider, canSelectMany: true });
	ext.vthostConnectView = vscode.window.createTreeView('vthostConnectExplorer', { treeDataProvider: ext.vtHostConnectProvider, canSelectMany: true });
	ext.vthostHostpadView = vscode.window.createTreeView('vthostHostpadExplorer', { treeDataProvider: ext.vtHostHostpadProvider, canSelectMany: true });
	// ext.vthostHostpadView = vscode.window.createTreeView('vthostHelpExplorer', { treeDataProvider: ext.vtHostHostpadProvider, canSelectMany: true })

	ext.context.subscriptions.push(ext.vthostView);
	ext.context.subscriptions.push(ext.vthostConnectView);
	ext.context.subscriptions.push(ext.vthostHostpadView);
	initializeSshConcfig();

	ext.context.subscriptions.push(
		vscode.window.onDidCloseTerminal(async (terminal: vscode.Terminal) => {
			if (ext.vtTerminalMgr.prefixRegex.test(terminal.name)) {
				await vscode.commands.executeCommand('vscode-sshclient.host.refresh');
			}
		})
	);

	ext.context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
			if (e.affectsConfiguration('hostpads.directory')) {
				initializeExtensionDirectory();
				ext.vtHostHostpadProvider.refresh();
			}
			if (e.affectsConfiguration('sshConfig')) {
				const sshConfigFile = vscode.workspace.getConfiguration('vscode-sshclient').get<string>('SSH.mirrorFile');
				ext.sshConfig = SSHConfig.parse(readSSHConfig(sshConfigFile));
				await vscode.commands.executeCommand('vscode-sshclient.host.refresh');
			}
		})
	);

	ext.registerCommand('vscode-sshclient.configure.sshconfig', async () => {
		await configureSshConfig();
	});

	ext.registerCommand('vscode-sshclient.hostpad.sendTerminal', (hp: VTHostHostpad) => {
		const at = vscode.window.activeTerminal;
		const fUrl = hp.resourceUri;
		if (fUrl && at) {
			at.sendText(readFileSync(fUrl.fsPath, { encoding: 'utf-8' }));
		}
	});
	ext.registerCommand('vscode-sshclient.terminal.runSelectedLines', async () => {
		const editor = vscode.window.activeTextEditor;
		if (editor === undefined) { return; }
		const document = editor.document;
		const selection = editor.selection;
		const sl = selection.start.line;
		const el = selection.end.line;
		// get line text in document.
		const selectedLines = Array.from(Array(el - sl + 1).keys()).map(n => sl + n).map(l => document.lineAt(l).text);
		// vsPrint(selectedLines.join("\n"))
		// vsPrint(vscode.window.activeTerminal?.name || "1")
		const terminal = vscode.window.activeTerminal;
		if (terminal) {
			terminal.sendText(selectedLines.join("\n"));
		}
	});
}

function initializeHostConnectBarItem() {
	const hostConnectBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	ext.context.subscriptions.push(hostConnectBarItem);
	hostConnectBarItem.hide();

	ext.context.subscriptions.push(vscode.window.onDidChangeActiveTerminal((terminal) => {
		if (terminal && ext.vtTerminalMgr.checkHostTerminalExistByNamePrefix(terminal.name)) {
			// https://code.visualstudio.com/api/references/icons-in-labels
			// breadcrumb-separator, repl, remote-explorer, vm-active
			hostConnectBarItem.text = `$(vm-active) ssh-client: ${terminal.name}`;
			hostConnectBarItem.show();
			return;
		}
		hostConnectBarItem.hide();
	}));
}

export function activate(context: vscode.ExtensionContext) {
	// vscode.window.onDidOpenTerminal((t: vscode.Terminal) => {
	// 	t.sendText("echo 'open'");

	// });


	// vscode.window.onDidCloseTerminal((t: vscode.Terminal) => {
	// 	t.sendText("echo 'close'");
	// 	vscode.window.showInformationMessage(t.name)

	// });

	// vscode.window.showInformationMessage('Hello World 2222!');
	// context.subscriptions.push(vscode.commands.registerCommand('terminalTest.createEditorTerminal', () => {
	// 	const v = vscode.window.createTerminal({ name: "test21", hideFromUser: false })
	// 	// v.show(true)
	// 	// vscode.commands.executeCommand('workbench.action.createTerminalEditor');
	// 	// vscode.window.showInformationMessage('Hello World 2!');
	// }));

	// context.subscriptions.push(vscode.commands.registerCommand('terminalTest.moveEditorTerminal', () => {
	// 	vscode.commands.executeCommand('workbench.action.createTerminalEditor');
	// 	vscode.window.showInformationMessage('Hello World 2!');
	// }));

	initializeExtensionVariables(context);
	initializeHostConnectBarItem();

	console.log('Congratulations, your extension "vscode-sshclient" is now active!');

	ext.registerCommand('vscode-sshclient.connect.refresh', (terminalName: string) => {
		const terminals = vscode.window.terminals.filter(t => t.name === terminalName);
		if (terminals.length === 0) {
			ext.vtHostConnectProvider.refresh(); return;
		}
		terminals[0].show();

	});

	ext.registerCommand('vscode-sshclient.host.refresh', (host?: string) => {
		ext.vtTerminalMgr.currentHost = host || ext.vtTerminalMgr.currentHost;
		ext.vtHostProvider.refresh();

		const ts = ext.vtTerminalMgr.checkHostConnectNumber(ext.vtTerminalMgr.currentHost);
		if (ts.length === 1) {
			ext.setContext('vscode-sshclient.hostConnect-explorer', false);
			ts[0].show();
		}

		if (ts.length >= 2) {
			ext.setContext('vscode-sshclient.hostConnect-explorer', true);
			ext.vtHostConnectProvider.refresh();
		}

		// vscode.window.showInformationMessage(ts.length.toString())

		const hostpadNumber = ext.vgHostHostpadMgr.queryHostpadNumberByHost(ext.vtTerminalMgr.currentHost);
		if (hostpadNumber === 0) {
			ext.setContext('vscode-sshclient.hostHostPad-explorer', false);
		} else {
			ext.setContext('vscode-sshclient.hostHostPad-explorer', true);
			ext.vtHostHostpadProvider.refresh();
		}
	});

	ext.registerCommand('vscode-sshclient.host.create-connect', async (vthost: VTHost) => {
		const t = await ext.vtTerminalMgr.createTerminal(vthost.label);
		ext.context.subscriptions.push(t);

		// const t = vscode.window.createTerminal(`VT@${host.label}@${Math.ceil(Math.random() * 100)}`);

		// t.show()
		// t.sendText(`ssh ${host.label}`, true);

		// await sleep(1000)
		await vscode.commands.executeCommand('vscode-sshclient.host.refresh', vthost.label);
	});
	ext.registerCommand('vscode-sshclient.connect.create-hostpad', async () => {
		const name: string | undefined = await vscode.window.showInputBox();
		if (!name) { return; }
		const hostdir = helper.join(ext.vtHosthostpadDirectory, 'hosts', ext.vtTerminalMgr.currentHost);
		mkdirpSync(hostdir);
		writeFileSync(`${hostdir}/${name}`, '');
		ext.vtHostHostpadProvider.refresh();
	});
	ext.registerCommand('vscode-sshclient.hostpad.refresh', () => {
		ext.vtHostHostpadProvider.refresh();
	});

	ext.registerCommand('vscode-sshclient.host.close-connect', async (vthost: VTHost) => {
		const terminal = ext.vtTerminalMgr.getTerminalByhost(vthost.label);
		if (terminal) {
			terminal.dispose();
		}
	});

	ext.registerCommand('vscode-sshclient.connect.rename', () => {
		vscode.commands.executeCommand('workbench.action.terminal.renameWithArg', { name: 'sss' });
	});
	ext.registerCommand('vscode-sshclient.host.refresh', () => {
		initializeSshConcfig();
	});
}

export function deactivate() { }

class VTHostProvider implements vscode.TreeDataProvider<VTHost> {

	private _onDidChangeTreeData: vscode.EventEmitter<VTHost | undefined | void> = new vscode.EventEmitter<VTHost | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<VTHost | undefined | void> = this._onDidChangeTreeData.event;

	constructor() { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: VTHost): vscode.TreeItem {
		return element;
	}

	getChildren(element?: VTHost): Thenable<VTHost[]> {
		if (ext.sshConfig) {
			const hosts = ext.sshConfig.filter((c: any) => c.param === 'Host');
			const elms = [];
			for (const host of hosts) {
				if (ext.vtTerminalMgr.checkHostConnectNumber(host.value).length === 1) {
					elms.push(new VTHost(host.value, 'vthost-connect'));
					continue;
				}
				// if (ext.vtTerminalMgr.checkHostConnectNumber(host.value).length >= 2) {
				elms.push(new VTHost(host.value, 'vthost'));
				// }

			}
			return Promise.resolve(elms);
			// return Promise.resolve(ext.sshConfig.filter((c: any) => c.param === 'Host').map((c: any) => new VTHost(c.value, 'vthost'));
		}
		return Promise.resolve([]);
	}
}

class VTHost extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly contextValue: "vthost" | "vthost-connect"
	) { super(label, 0); }

	command = { command: "vscode-sshclient.host.refresh", title: "111", arguments: [this.label] };
	iconPath = ext.vtTerminalMgr.checkActiveTerminalByHost(this.label) ? {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'vm-default.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'vm-default.svg')
	} : {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'vm-active.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'vm-active.svg')
	};
	description = 'ip';//ext.sshConfig[1].config[0].value
}

class VTHostConnect extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly terminalName: string,
		public readonly host: string,
		// private version: string,
		// public readonly command?: vscode.Command
	) {
		super(label, 0);
	}
	command = { command: "vscode-sshclient.connect.refresh", title: "111", arguments: [this.terminalName] };
	contextValue = 'vtconnect';
}

class VTHostConnectProvider implements vscode.TreeDataProvider<VTHostConnect> {
	private _onDidChangeTreeData: vscode.EventEmitter<VTHostConnect | undefined | void> = new vscode.EventEmitter<VTHostConnect | undefined | void>();
	readonly onDidChangeTreeData: vscode.Event<VTHostConnect | undefined | void> = this._onDidChangeTreeData.event;
	constructor() { }
	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: VTHostConnect): vscode.TreeItem {
		return element;
	}

	getChildren(element?: VTHostConnect): Thenable<VTHostConnect[]> {
		const ts = ext.vtTerminalMgr.query();

		return Promise.all(ts.map(t => {
			const { host, seq } = ext.vtTerminalMgr.parserTerminalName(t.name);
			return new VTHostConnect(t.name.split('@').pop()!, t.name, host);
		}));
	}
}

// export class VTHosthostpad extends vscode.TreeItem {
// 	constructor(
// 		public readonly label: string,
// 		// private version: string,
// 		// public readonly command?: vscode.Command
// 	) {
// 		super(label, 0);
// 	}
// 	command = { command: "vscode-sshclient.hostpad.refresh", title: "111", arguments: [this.label] };
// }
// class VTHosthostpadProvider implements vscode.TreeDataProvider<VTHosthostpad> {
// 	onDidChangeTreeData?: vscode.Event<void | VTHosthostpad | null | undefined> | undefined;
// 	getTreeItem(element: VTHosthostpad): VTHosthostpad | Thenable<VTHosthostpad> {
// 		throw new Error("Method not implemented.");
// 	}
// 	getChildren(element?: VTHosthostpad | undefined): vscode.ProviderResult<VTHosthostpad[]> {
// 		throw new Error("Method not implemented.");
// 	}
// }



type VTHostHostpad = TreeItem;
class VTHosthostpadProvider implements TreeDataProvider<VTHostHostpad> {
	private _onDidChangeTreeData: EventEmitter<VTHostHostpad | void> = new EventEmitter<VTHostHostpad | void>();
	public readonly onDidChangeTreeData: Event<VTHostHostpad | void> = this._onDidChangeTreeData.event;

	public refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	async getTreeItem(element: VTHostHostpad): Promise<VTHostHostpad> {
		return element;
	}

	async getChildren(element?: VTHostHostpad): Promise<VTHostHostpad[]> {
		const fPath: string = `${ext.vtHosthostpadDirectory}/hosts/${ext.vtTerminalMgr.currentHost}`;
		if (!existsSync(fPath)) { return Promise.resolve([]); };
		return readdirSync(fPath).filter(f => statSync(path.join(fPath, f)).isFile()).map(f => {
			const uri = Uri.file(join(fPath, f));
			const item = new TreeItem(uri, 0);
			item.command = {
				command: 'vscode.open',
				arguments: [uri],
				title: basename(uri.path)
			};
			item.contextValue = 'vthostpad';
			return item;
		});
	}
}

class VTHostHostpadManager {
	constructor() { }
	public init() {
	}
	public queryHostpadNumberByHost(host: string): number {
		const hostHostPadPath: string = `${homedir()}/vscode-sshclient/hosts/${host}`;
		if (!existsSync(hostHostPadPath)) { return 0; }
		return readdirSync(hostHostPadPath).length;
	}
}


// global variables
namespace ext {
	export let context: vscode.ExtensionContext;
	export const registerCommand = (command: string, callback: (...args: any[]) => any, thisArg?: any) =>
		context.subscriptions.push(vscode.commands.registerCommand(command, callback, thisArg));
	export const setContext = <T>(ctx: string, value: T) => vscode.commands.executeCommand('setContext', ctx, value);
	export const vtTerminalMgr = new VTTerminalManager();
	export let vtHostMgr: any;
	export let vgHostConnectMgr: any;
	export const vgHostHostpadMgr: VTHostHostpadManager = new VTHostHostpadManager();
	export const vtHostProvider = new VTHostProvider();
	export const vtHostConnectProvider = new VTHostConnectProvider();
	export const vtHostHostpadProvider = new VTHosthostpadProvider();
	export let vtHosthostpadDirectory: string;
	export let sshConfig: any | undefined;
	export let vthostView: vscode.TreeView<VTHost>;
	export let vthostConnectView: vscode.TreeView<VTHostConnect>;
	export let vthostHostpadView: vscode.TreeView<VTHostHostpad>;
}





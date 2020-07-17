import * as path from 'path';
import { homedir } from 'os';
import { join, basename } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';

import * as vscode from 'vscode';
import { TreeItem, TreeDataProvider, Uri, EventEmitter, Event } from 'vscode';

import { readdirSync, statSync, mkdirpSync, ensureFileSync } from 'fs-extra';

const SSHConfig = require('ssh-config')

import { createTerminal } from './terminal';
import * as helper from './helper';

import { vsPrint } from './dev';
import { VTTerminalManager } from './terminal';

function readSSHConfig(sshConfigPath?: string) {
	const sshconfigfile = helper.join(sshConfigPath || homedir(), '.ssh', 'config')
	return readFileSync(sshconfigfile, { encoding: 'utf-8' })
}

export function getConfigure<T>(name: string, defaultValue?: T): T | undefined {
	return vscode.workspace.getConfiguration('vscode-sshclient').get(name) || defaultValue;
}

async function configureSshConfig() {
	// @ext:ms-vscode-remote.remote-ssh,ms-vscode-remote.remote-ssh-edit config file
	const defutlSSHConfig = helper.join(homedir(), '.ssh', 'config')
	const pick = await vscode.window.showQuickPick([defutlSSHConfig, 'Settings'])
	if (!pick) return;
	mkdirpSync(helper.join(homedir(), '.ssh'))
	ensureFileSync(defutlSSHConfig)
	const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(defutlSSHConfig));
	await vscode.languages.setTextDocumentLanguage(doc, 'ssh_config');
	const x = await vscode.window.showTextDocument(doc);
	ext.context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((doc) => {
		if (doc.uri.fsPath == defutlSSHConfig) {
			initializeSshConcfig()
			ext.vtHostProvider.refresh()
		}
	}))
}

function initializeExtensionDirectory() {
	const p = getConfigure('hostpads.directory', path.join(homedir(), 'vscode-sshclient'))!;
	const dpath = p.startsWith('~/') ? join(homedir(), p.substr(2)) : p;
	ext.vtHosthostpadDirectory = dpath
	mkdirpSync(dpath)
	mkdirpSync(helper.join(dpath, 'hosts'))
	mkdirpSync(helper.join(dpath, 'groups'))
}

function initializeSshConcfig() {
	const scf = getConfigure<string>('SSH.configFile')
	if (scf) {
		if (existsSync(scf)) {
			ext.sshConfig = SSHConfig.parse(readSSHConfig())
		}
	} else {
		if (existsSync(helper.join(homedir(), '.ssh', 'config'))) {
			ext.sshConfig = SSHConfig.parse(helper.join(homedir(), '.ssh', 'config'))
		}
	}
}

export function initializeExtensionVariables(ctx: vscode.ExtensionContext): void {
	ext.context = ctx
	initializeExtensionDirectory()
	ext.vthostView = vscode.window.createTreeView('vthostExplorer', { treeDataProvider: ext.vtHostProvider, canSelectMany: true })
	ext.vthostConnectView = vscode.window.createTreeView('vthostConnectExplorer', { treeDataProvider: ext.vtHostConnectProvider, canSelectMany: true })
	ext.vthostHostpadView = vscode.window.createTreeView('vthostHostpadExplorer', { treeDataProvider: ext.vtHostHostpadProvider, canSelectMany: true })
	// ext.vthostHostpadView = vscode.window.createTreeView('vthostHelpExplorer', { treeDataProvider: ext.vtHostHostpadProvider, canSelectMany: true })

	ext.context.subscriptions.push(ext.vthostView)
	ext.context.subscriptions.push(ext.vthostConnectView)
	ext.context.subscriptions.push(ext.vthostHostpadView)
	initializeSshConcfig()

	ext.context.subscriptions.push(vscode.window.onDidCloseTerminal(async (terminal: vscode.Terminal) => {
		if (/^VT@/.test(terminal.name)) {
			await vscode.commands.executeCommand('vscode-sshclient.host.refresh')
		}
	}))

	ext.context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e: vscode.ConfigurationChangeEvent) => {
			if (e.affectsConfiguration('hostpads.directory')) {
				initializeExtensionDirectory()
				ext.vtHostHostpadProvider.refresh()
			}
			if (e.affectsConfiguration('sshConfig')) {
				ext.sshConfig = SSHConfig.parse(readSSHConfig())
			}
		})
	);

	ext.registerCommand('vscode-sshclient.configure.sshconfig', async () => {
		await configureSshConfig()
	})
}

function initializeHostConnectBarItem() {
	const hostConnectBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	ext.context.subscriptions.push(hostConnectBarItem)
	hostConnectBarItem.hide()

	ext.context.subscriptions.push(vscode.window.onDidChangeActiveTerminal((terminal) => {
		if (terminal && /^VT@/.test(terminal.name)) {
			// https://code.visualstudio.com/api/references/icons-in-labels
			// breadcrumb-separator, repl, remote-explorer, vm-active
			hostConnectBarItem.text = `$(vm-active) ssh-client: ${terminal.name}`
			hostConnectBarItem.show()
			return
		}
		hostConnectBarItem.hide()
	}))
}

export function activate(context: vscode.ExtensionContext) {
	initializeExtensionVariables(context);
	initializeHostConnectBarItem()

	console.log('Congratulations, your extension "vscode-sshclient" is now active!');

	ext.registerCommand('vscode-sshclient.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vscode-sshclient1!');
	});

	ext.registerCommand('vscode-sshclient.connect.refresh', (terminalName: string) => {
		const terminals = vscode.window.terminals.filter(t => t.name === terminalName)
		if (terminals.length === 0) {
			ext.vtHostConnectProvider.refresh(); return
		}
		terminals[0].show();

	})

	ext.registerCommand('vscode-sshclient.host.refresh', (host?: string) => {
		ext.vtTerminalMgr.currentHost = host || ext.vtTerminalMgr.currentHost
		ext.vtHostProvider.refresh()

		const ts = ext.vtTerminalMgr.checkHostConnectNumber(ext.vtTerminalMgr.currentHost)
		if (ts.length === 1) {
			ext.setContext('vscode-sshclient.hostConnect-explorer', false)
			ts[0].show()
		}

		if (ts.length >= 2) {
			ext.setContext('vscode-sshclient.hostConnect-explorer', true)
			ext.vtHostConnectProvider.refresh()
		}

		const hostpadNumber = ext.vgHostHostpadMgr.queryHostpadNumberByHost(ext.vtTerminalMgr.currentHost)
		if (hostpadNumber === 0) {
			ext.setContext('vscode-sshclient.hostHostPad-explorer', false)
		} else {
			ext.setContext('vscode-sshclient.hostHostPad-explorer', true)
			ext.vtHostHostpadProvider.refresh()
		}
	})

	ext.registerCommand('vscode-sshclient.host.create-connect', async (vthost: VTHost) => {
		const t = await createTerminal(vthost.label)
		ext.context.subscriptions.push(t)
		// const t = vscode.window.createTerminal(`VT@${host.label}@${Math.ceil(Math.random() * 100)}`);

		// t.show()
		// t.sendText(`ssh ${host.label}`, true);

		// await sleep(1000)
		await vscode.commands.executeCommand('vscode-sshclient.host.refresh', vthost.label)
	})
	ext.registerCommand('vscode-sshclient.connect.create-hostpad', async () => {
		const name: string | undefined = await vscode.window.showInputBox();
		if (!name) return;
		const hostdir = helper.join(ext.vtHosthostpadDirectory, 'hosts', ext.vtTerminalMgr.currentHost)
		mkdirpSync(hostdir)
		writeFileSync(`${hostdir}/VT@${name}`, '')
		ext.vtHostHostpadProvider.refresh()
	})
	ext.registerCommand('vscode-sshclient.hostpad.refresh', () => {
		ext.vtHostHostpadProvider.refresh()
	})
}

export function deactivate() { }

export class VTHostProvider implements vscode.TreeDataProvider<VTHost> {

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
		// return Promise.resolve([])
		return Promise.resolve(ext.sshConfig.filter((c: any) => c.param === 'Host').map((c: any) => new VTHost(c.value, 0)));
	}
}

export class VTHost extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState = 0,
		public readonly host?: string
	) { super(label, 0); }

	command = { command: "vscode-sshclient.host.refresh", title: "111", arguments: [this.label] };
	iconPath = ext.vtTerminalMgr.checkActiveTerminalByHost(this.label) ? {
		light: path.join(__filename, '..', '..', 'resources', 'light', 'vm-default.svg'),
		dark: path.join(__filename, '..', '..', 'resources', 'dark', 'vm-default.svg')
	} : {
			light: path.join(__filename, '..', '..', 'resources', 'light', 'vm-active.svg'),
			dark: path.join(__filename, '..', '..', 'resources', 'dark', 'vm-active.svg')
		}
	contextValue = 'vthost';
	description = 'ip'//ext.sshConfig[1].config[0].value
}

export class VTHostConnect extends vscode.TreeItem {
	constructor(
		public readonly label: string
		// private version: string,
		// public readonly command?: vscode.Command
	) {
		super(label, 0);
	}
	command = { command: "vscode-sshclient.connect.refresh", title: "111", arguments: [this.label] };
	contextValue = 'vtconnect'
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
		const ts = ext.vtTerminalMgr.query()
		return Promise.all(ts.map(t => new VTHostConnect(t.name)))
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



type VTHostHostpad = TreeItem
export class VTHosthostpadProvider implements TreeDataProvider<VTHostHostpad> {
	private _onDidChangeTreeData: EventEmitter<VTHostHostpad | void> = new EventEmitter<VTHostHostpad | void>();
	public readonly onDidChangeTreeData: Event<VTHostHostpad | void> = this._onDidChangeTreeData.event;

	public refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	async getTreeItem(element: VTHostHostpad): Promise<VTHostHostpad> {
		return element;
	}

	async getChildren(element?: VTHostHostpad): Promise<VTHostHostpad[]> {
		const fPath: string = `${homedir()}/vscode-sshclient/hosts/${ext.vtTerminalMgr.currentHost}`
		if (!existsSync(fPath)) { return Promise.resolve([]) };
		return readdirSync(fPath).filter(f => statSync(path.join(fPath, f)).isFile()).map(f => {
			const uri = Uri.file(join(fPath, f));
			const item = new TreeItem(uri, 0);
			item.command = {
				command: 'vscode.open',
				arguments: [uri, vscode.ViewColumn.Two],
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
		const hostHostPadPath: string = `${homedir()}/vscode-sshclient/hosts/${host}`
		if (!existsSync(hostHostPadPath)) { return 0 }
		return readdirSync(hostHostPadPath).length
	}
}


// global variables
namespace ext {
	export let context: vscode.ExtensionContext;
	export const registerCommand = (command: string, callback: (...args: any[]) => any, thisArg?: any) =>
		context.subscriptions.push(vscode.commands.registerCommand(command, callback, thisArg));
	export const setContext = <T>(ctx: string, value: T) => vscode.commands.executeCommand('setContext', ctx, value);
	export const vtTerminalMgr = new VTTerminalManager()
	export let vtHostMgr: any;
	export let vgHostConnectMgr: any;
	export const vgHostHostpadMgr: VTHostHostpadManager = new VTHostHostpadManager();
	export const vtHostProvider = new VTHostProvider();
	export const vtHostConnectProvider = new VTHostConnectProvider();
	export const vtHostHostpadProvider = new VTHosthostpadProvider();
	export let vtHosthostpadDirectory: string;
	export let sshConfig: any;
	export let vthostView: vscode.TreeView<VTHost>;
	export let vthostConnectView: vscode.TreeView<VTHostConnect>
	export let vthostHostpadView: vscode.TreeView<VTHostHostpad>
}




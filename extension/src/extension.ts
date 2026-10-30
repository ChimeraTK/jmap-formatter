// SPDX-FileCopyrightText: Deutsches Elektronen-Synchrotron DESY, MSK, ChimeraTK Project <chimeratk-support@desy.de>
// SPDX-License-Identifier: LGPL-3.0-or-later
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { JmapJsonService } from './jsonService';

export function activate(context: vscode.ExtensionContext) {
    const script = context.asAbsolutePath(path.join('python', 'jmapfmt.py'));

    const schemaPath = context.asAbsolutePath(path.join('schemas', 'jmap.schema.json'));
    const schemaUri = 'jmap-schema://schemas/jmap.schema.json';
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const jsonService = new JmapJsonService(schemaUri, schema);

    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider('jmap', {
            provideDocumentFormattingEdits(document: vscode.TextDocument) {
                const text = document.getText();
                return new Promise<vscode.TextEdit[]>((resolve, reject) => {
                    const child = execFile('python3', [script, 'stdin'], { timeout: 5000 },
                        (err, stdout) => {
                            if (err) return reject(err);
                            if (stdout === text) return resolve([]);
                            const range = new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(text.length));
                            resolve([vscode.TextEdit.replace(range, stdout)]);
                        });
                    if (child.stdin) child.stdin.end(text);
                });
            }
        }),
        vscode.languages.registerDocumentSymbolProvider('jmap', new JmapSymbolProvider()),
        vscode.languages.registerCompletionItemProvider('jmap', {
            async provideCompletionItems(document, position) {
                const list = await jsonService.complete(document, position);
                if (!list) return undefined;
                return list.items.map(item => toCompletionItem(item));
            }
        }),
        vscode.languages.registerHoverProvider('jmap', {
            async provideHover(document, position) {
                const hover = await jsonService.hover(document, position);
                if (!hover) return undefined;
                return new vscode.Hover(
                    toHoverContents(hover.contents),
                    toRange(hover.range));
            }
        })
    );
}

function toCompletionItem(item: Record<string, any>): vscode.CompletionItem {
    const completion = new vscode.CompletionItem(
        item.label,
        item.kind !== undefined ? item.kind as vscode.CompletionItemKind : vscode.CompletionItemKind.Value);
    completion.detail = item.detail;
    completion.documentation = toMarkdown(item.documentation);
    completion.insertText = item.textEdit ? item.textEdit.newText : item.insertText;
    completion.filterText = item.filterText;
    completion.sortText = item.sortText;
    if (item.textEdit?.range) completion.range = toRange(item.textEdit.range);
    return completion;
}

// LSP text may be a plain string, { kind, value } markup, or { language, value }.
function toMarkdown(value: any): vscode.MarkdownString | undefined {
    const text = markdownText(value);
    return text === undefined ? undefined : new vscode.MarkdownString(text);
}

function markdownText(value: any): string | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string') return value;
    if (typeof value.value === 'string') return value.value;
    return undefined;
}

// Hover contents may be a single item or an array of items.
function toHoverContents(value: any): vscode.MarkdownString | vscode.MarkdownString[] {
    const items = Array.isArray(value) ? value : [value];
    const result = items.map(markdownText).filter((t): t is string => t !== undefined)
        .map(t => new vscode.MarkdownString(t));
    return result.length === 1 ? result[0] : result;
}

function toRange(range: any): vscode.Range | undefined {
    if (!range) return undefined;
    return new vscode.Range(range.start.line, range.start.character, range.end.line, range.end.character);
}

// Container keys that are expanded; all other keys hold plain attribute values.
const CHILDREN = 'children';
const CHANNELS = 'channels';
const SUBHANDLER = 'subhandler';
const ADDRESS = 'address';
const REPRESENTATION = 'representation';
const SELECTED_BY = 'selectedBy';
const TRIGGERED_BY_INTERRUPT = 'triggeredByInterrupt';

class JmapSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const text = document.getText();
        let root: JsonNode | undefined;
        try {
            root = parse(text);
        } catch {
            return [];
        }
        if (!root) return [];

        const range = new vscode.Range(document.positionAt(0),
            document.positionAt(text.length));
        const file = new vscode.DocumentSymbol(path.basename(document.fileName), '',
            vscode.SymbolKind.File, range, range);

        const addressSpace = findChild(root, 'addressSpace');
        if (addressSpace) {
            file.children.push(this.group(document, addressSpace,
                addressSpace.children.map(c => this.register(document, c))));
        }
        const interruptHandler = findChild(root, 'interruptHandler');
        if (interruptHandler) {
            file.children.push(this.group(document, interruptHandler,
                interruptHandler.children.map(c => this.controller(document, c))));
        }
        return [file];
    }

    private group(document: vscode.TextDocument, node: JsonNode, children: vscode.DocumentSymbol[]): vscode.DocumentSymbol {
        const symbol = this.symbol(document, node, vscode.SymbolKind.Namespace);
        symbol.children = children;
        return symbol;
    }

    private controller(document: vscode.TextDocument, node: JsonNode): vscode.DocumentSymbol {
        const symbol = this.symbol(document, node, vscode.SymbolKind.Event);
        const subhandler = findChild(node, SUBHANDLER);
        if (subhandler) {
            symbol.children = subhandler.children.map(c => this.controller(document, c));
        }
        return symbol;
    }

    private register(document: vscode.TextDocument, node: JsonNode): vscode.DocumentSymbol {
        const symbol = this.symbol(document, node, this.registerKind(node));
        for (const child of node.children) {
            if (child.name === CHILDREN) {
                for (const reg of child.children) symbol.children.push(this.register(document, reg));
            } else if (child.name === CHANNELS) {
                symbol.children.push(this.channels(document, child));
            }
        }
        return symbol;
    }

    private registerKind(node: JsonNode): vscode.SymbolKind {
        if (findChild(node, CHANNELS)) return vscode.SymbolKind.Array;
        if (findChild(node, TRIGGERED_BY_INTERRUPT)) return vscode.SymbolKind.Event;
        if (findChild(node, SELECTED_BY)) return vscode.SymbolKind.Key;
        if (findChild(node, CHILDREN)) return vscode.SymbolKind.Struct;
        if (!findChild(node, ADDRESS) && findChild(node, REPRESENTATION)) return vscode.SymbolKind.Field;
        return vscode.SymbolKind.Object;
    }

    private channels(document: vscode.TextDocument, node: JsonNode): vscode.DocumentSymbol {
        const folder = this.symbol(document, node, vscode.SymbolKind.Namespace);
        for (const channel of node.children) {
            const symbol = this.symbol(document, channel, this.channelKind(channel));
            const children = findChild(channel, CHILDREN);
            if (children) {
                for (const reg of children.children) symbol.children.push(this.register(document, reg));
            }
            folder.children.push(symbol);
        }
        return folder;
    }

    private channelKind(node: JsonNode): vscode.SymbolKind {
        if (findChild(node, SELECTED_BY)) return vscode.SymbolKind.Key;
        if (findChild(node, CHILDREN)) return vscode.SymbolKind.Struct;
        return vscode.SymbolKind.Class;
    }

    private symbol(document: vscode.TextDocument, node: JsonNode, kind: vscode.SymbolKind): vscode.DocumentSymbol {
        const range = new vscode.Range(document.positionAt(node.start), document.positionAt(node.end));
        return new vscode.DocumentSymbol(node.name, '', kind, range, range);
    }
}

function findChild(node: JsonNode, name: string): JsonNode | undefined {
    return node.children.find(c => c.name === name);
}

interface JsonNode {
    name: string;
    kind: vscode.SymbolKind;
    start: number;
    end: number;
    children: JsonNode[];
}

function parse(text: string): JsonNode {
    const root: JsonNode = { name: '', kind: vscode.SymbolKind.File, start: 0, end: text.length, children: [] };
    const stack: JsonNode[] = [root];
    let i = 0;

    const skipWs = () => { while (i < text.length && /\s/.test(text[i])) i++; };

    const readString = (): string => {
        i++; // opening quote
        let s = '';
        while (i < text.length && text[i] !== '"') {
            if (text[i] === '\\') { s += text[i]; i++; }
            s += text[i]; i++;
        }
        i++; // closing quote
        return s;
    };

    const value = (): void => {
        skipWs();
        const c = text[i];
        if (c === '{' || c === '[') {
            parseContainer(c);
        } else if (c === '"') {
            readString();
        } else {
            while (i < text.length && !/[\s,\]}]/.test(text[i])) i++;
        }
    };

    const parseContainer = (open: string): void => {
        const close = open === '{' ? '}' : ']';
        const isObject = open === '{';
        i++; // consume open
        let first = true;
        while (i < text.length) {
            skipWs();
            if (text[i] === close) { i++; break; }
            if (!first) { if (text[i] === ',') { i++; skipWs(); } }
            first = false;
            if (isObject) {
                const keyStart = i;
                const keyName = readString();
                skipWs();
                if (text[i] === ':') i++;
                skipWs();
                const lookahead = text[i];
                if (lookahead === '{' || lookahead === '[') {
                    const node: JsonNode = {
                        name: keyName,
                        kind: lookahead === '{' ? vscode.SymbolKind.Object : vscode.SymbolKind.Array,
                        start: keyStart, end: keyStart, children: []
                    };
                    stack[stack.length - 1].children.push(node);
                    stack.push(node);
                    parseContainer(lookahead);
                    node.end = i;
                    stack.pop();
                } else {
                    const valueStart = i;
                    value();
                    stack[stack.length - 1].children.push({
                        name: keyName, kind: vscode.SymbolKind.String,
                        start: keyStart, end: i, children: []
                    });
                }
            } else {
                value();
            }
        }
    };

    value();
    return root;
}

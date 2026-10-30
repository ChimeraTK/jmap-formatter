// SPDX-FileCopyrightText: Deutsches Elektronen-Synchrotron DESY, MSK, ChimeraTK Project <chimeratk-support@desy.de>
// SPDX-License-Identifier: LGPL-3.0-or-later
import {
    getLanguageService, LanguageService, JSONDocument,
    TextDocument as LspTextDocument, CompletionList, Hover
} from 'vscode-json-languageservice';
import * as vscode from 'vscode';

// Bridges the JSON language service (the engine behind VS Code's built-in JSON
// IntelliSense) to our custom `jmap` language, using the bundled schema.
export class JmapJsonService {
    private readonly service: LanguageService;

    constructor(schemaUri: string, schema: object) {
        this.service = getLanguageService({
            schemaRequestService: (uri) =>
                uri === schemaUri ? Promise.resolve(JSON.stringify(schema)) : Promise.reject(`unresolved schema ${uri}`),
        });
        this.service.configure({
            allowComments: false,
            validate: false,
            schemas: [{ uri: schemaUri, fileMatch: ['*.jmap'] }],
        });
    }

    private parse(document: vscode.TextDocument): { lsp: LspTextDocument; json: JSONDocument } {
        const lsp = LspTextDocument.create(document.uri.toString(), 'jmap', document.version, document.getText());
        return { lsp, json: this.service.parseJSONDocument(lsp) };
    }

    async complete(document: vscode.TextDocument, position: vscode.Position): Promise<CompletionList | null> {
        const { lsp, json } = this.parse(document);
        return this.service.doComplete(lsp, position, json);
    }

    async hover(document: vscode.TextDocument, position: vscode.Position): Promise<Hover | null> {
        const { lsp, json } = this.parse(document);
        return this.service.doHover(lsp, position, json);
    }
}

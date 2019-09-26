import * as ts from 'typescript';
import * as lsp from 'vscode-languageserver-protocol';
import { navigationTreeIsSymbol, stringtoSymbolKind } from './symbols';

// Originally copied from https://github.com/theia-ide/typescript-language-server/blob/master/server/src/document-symbol.ts#L58
// togther with some util functions

namespace Position {
    export function Min(): undefined;
    export function Min(...positions: lsp.Position[]): lsp.Position;
    export function Min(...positions: lsp.Position[]): lsp.Position | undefined {
        if (!positions.length) {
            return undefined;
        }
        let result = positions.pop()!;
        for (const p of positions) {
            if (isBefore(p, result)) {
                result = p;
            }
        }
        return result;
    }
    export function isBefore(one: lsp.Position, other: lsp.Position): boolean {
        if (one.line < other.line) {
            return true;
        }
        if (other.line < one.line) {
            return false;
        }
        return one.character < other.character;
    }
    export function Max(): undefined;
    export function Max(...positions: lsp.Position[]): lsp.Position;
    export function Max(...positions: lsp.Position[]): lsp.Position | undefined {
        if (!positions.length) {
            return undefined;
        }
        let result = positions.pop()!;
        for (const p of positions) {
            if (isAfter(p, result)) {
                result = p;
            }
        }
        return result;
    }
    export function isAfter(one: lsp.Position, other: lsp.Position): boolean {
        return !isBeforeOrEqual(one, other);
    }
    export function isBeforeOrEqual(one: lsp.Position, other: lsp.Position): boolean {
        if (one.line < other.line) {
            return true;
        }
        if (other.line < one.line) {
            return false;
        }
        return one.character <= other.character;
    }
}

namespace Range {
    export function intersection(one: lsp.Range, other: lsp.Range): lsp.Range | undefined {
        const start: lsp.Position = Position.Max(other.start, one.start);
        const end: lsp.Position = Position.Min(other.end, one.end);
        if (Position.isAfter(start, end)) {
            // this happens when there is no overlap:
            // |-----|
            //          |----|
            return undefined;
        }
        return lsp.Range.create(start, end);
    }
}

function asRange(sourceFile: ts.SourceFile, textSpan: ts.TextSpan): lsp.Range {
    return {
        start: ts.getLineAndCharacterOfPosition(sourceFile, textSpan.start),
        end: ts.getLineAndCharacterOfPosition(sourceFile, textSpan.start + textSpan.length),
    }
}

// Copy from typescript-langserver
export function collectDocumentSymbols(sourceFile: ts.SourceFile, parent: ts.NavigationTree, flatten = false): lsp.DocumentSymbol[] {
    const symbols: lsp.DocumentSymbol[] = [];
    if (parent.childItems) {
        for (const item of parent.childItems) {
            collectDocumentSymbolsInRange(sourceFile, item, symbols, { start: asRange(sourceFile, item.spans[0]).start, end: asRange(sourceFile, item.spans[item.spans.length - 1]).end }, flatten);
        }
    }
    return symbols;

    // return collectDocumentSymbolsInRange(sourceFile, parent, symbols, { start: asRange(sourceFile, parent.spans[0]).start, end: asRange(sourceFile, parent.spans[parent.spans.length - 1]).end }, flatten);
}

// TODO clean up the logic here
function collectDocumentSymbolsInRange(sourceFile: ts.SourceFile, parent: ts.NavigationTree, symbols: lsp.DocumentSymbol[], range: lsp.Range, flatten = false): boolean {
    // let shouldInclude = shouldIncludeEntry(parent);
    let shouldInclude = navigationTreeIsSymbol(parent)

    for (const span of parent.spans) {
        const spanRange = asRange(sourceFile, span);
        if (!Range.intersection(range, spanRange)) {
            continue;
        }

        const children: lsp.DocumentSymbol[] = flatten ? symbols : [];
        if (parent.childItems) {
            for (const child of parent.childItems) {
                if (child.spans.some(childSpan => !!Range.intersection(spanRange, asRange(sourceFile, childSpan)))) {
                    const includedChild = collectDocumentSymbolsInRange(sourceFile, child, children, spanRange);
                    shouldInclude = shouldInclude || includedChild;
                }
            }
        }
        let selectionRange = spanRange;
        if (parent.nameSpan) {
            const nameRange = asRange(sourceFile, parent.nameSpan);
            // In the case of mergeable definitions, the nameSpan is only correct for the first definition.
            if (Range.intersection(spanRange, nameRange)) {
                selectionRange = nameRange;
            }
        }
        if (shouldInclude) {
            symbols.push({
                name: parent.text,
                detail: '',
                kind: stringtoSymbolKind(parent.kind),
                range: spanRange,
                selectionRange,
                children
            });
        }

        // TODO no need?
        break;
    }

    return shouldInclude;
}

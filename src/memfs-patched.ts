import { Logger } from './logging';
import { InMemoryFileSystem, typeScriptLibraries } from './memfs';
import { path2uri } from './util';

import { join } from 'path'

import * as ts from 'typescript'

export class PatchedInMemoryFileSystem extends InMemoryFileSystem {
    private log: Logger;
    private readonly rootUri: string;

    constructor(path: string, logger: Logger) {
        super(path, logger);
        this.rootUri = path2uri(path);
        this.log = logger;
    }

    public readFile(path: string): string {
        const content = this.readFileIfExistsOverwrite(path)
        if (content === undefined) {
            // @ts-ignore
            // this.logger.info(`readFile ${path} requested by TypeScript but content not available`)

            const content = ts.sys.readFile(path, 'utf8'); // fs.readFileSync(path, 'utf8')
            // this.add(path2uri(path), content)
            return content!
        }
        return content
    }

    public add(uri: string, content?: string): void {
        if (!uri.startsWith(this.rootUri) && uri.indexOf(join('node_modules', 'typescript')) === -1) {
            this.log.error('File ' + uri + ' out of root path');
        } else {
            super.add(uri, content);
        }
    }

    /**
     * @param path file path (both absolute or relative file paths are accepted)
     * @return file's content in the following order (overlay then cache).
     * If there is no such file, returns undefined
     */
    private readFileIfExistsOverwrite(path: string): string | undefined {
        const uri = path2uri(path)
        let content = this.overlay.get(uri)
        if (content !== undefined) {
            return content
        }

        // TODO This assumes that the URI was a file:// URL.
        //      In reality it could be anything, and the first URI matching the path should be used.
        //      With the current Map, the search would be O(n), it would require a tree to get O(log(n))
        // @ts-ignore
        content = this.files.get(uri)
        if (content !== undefined) {
            return content
        }

        return typeScriptLibraries.get(path)
    }

}

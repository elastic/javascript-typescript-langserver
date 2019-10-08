import { Logger } from './logging';

import { spawnSync } from 'child_process'
import * as fsExtra from 'fs-extra'
// @ts-ignore
import * as gunzip from 'gunzip-maybe';
import * as fs from 'mz/fs';
import * as path from 'path';
import * as tarFs from 'tar-fs';

// import * as rimraf from 'rimraf';
// import { promisify } from 'util';

// @ts-ignore
import Lockfile from '@yarnpkg/lockfile'

import * as http from 'http';
import * as https from 'https';
import internal = require('stream');

export class DependencyManager {
    // private rimrafAysnc = promisify(rimraf);

    constructor(readonly rootPath: string,
                readonly cachePath: string,
                readonly logger: Logger,
                readonly gitHostWhitelist: string[]) { }

    public async installDependency(useNpm: boolean): Promise<void> {
        try {
            await this.downloadDepsRecurisively(this.rootPath, useNpm)
        } catch (e) {
            console.debug(e)
        }

        // TO check if this is neccessary if we just download deps inside the workspace
        // await Promise.all(iterare.default(this.packageManager.packageJsonUris()).map(
        //     async uri => {
        //         console.log(uri)
        //     }
        // ))
    }

    public shutdown(): void {
        // TODO check the best way to kill
        // TODO is this sync or async
        // console.debug('shutdowwn')
        // this.npmProcess.kill('SIGKILL')
    }

    public runNpm(directory: string): void {
        const env = Object.create(process.env);
        env.TERM = 'dumb';

        const cwd = directory;
        // let cmd = 'yarn';
        //
        // if (existsSync(resolve(cwd, 'package-lock.json'))) {
        //     cmd = 'npm'
        // }
        if (!fs.existsSync(path.resolve(cwd, 'package.json'))) {
            return
        }

        const yarnScript = require.resolve('yarn/bin/yarn.js');
        // console.error('Yarn script location' + yarnScript);

        // TODO, make sure deps download in kibana/data folder
        // this.npmProcess =
        spawnSync(
            process.execPath,
            [
                yarnScript,
                'install',
                '--json',
                '--ignore-scripts', // no user script will be run
                '--no-progress', // don't show progress
                '--non-interactive',
                '--ignore-engines', // ignore "incompatible module" error
                '--ignore-optional',
                '--no-bin-links',
                '--production==false', // Otherwise not all deps will be downloaded
                '--cache-folder=' + path.resolve(this.cachePath, 'Yarn'),
            ],
            {
                env,
                cwd,
                stdio: 'inherit',
            }
        )

        // TODO filter deps
        // this.deletePackageRecursively(this.rootPath);

        // this.npmProcess.stdout.on('data', data => {
        //     console.debug('stdout: ' + data)
        // })
        //
        // this.npmProcess.stderr.on('data', data => {
        //     console.debug('stderr:' + data)
        // })
        //
        // this.npmProcess.on('error', err => {
        //     console.debug('error:' + err)
        // })
    }

    private async downloadDepsRecurisively(rootPath: string, useNpm: boolean): Promise<void> {
        try {
            const names = await fs.readdir(rootPath);
            for (const name of names) {
                const childPath = path.resolve(rootPath, name);
                const stat = await fs.stat(childPath);
                if (stat.isDirectory()) {
                    if (name === 'node_modules') {
                        return;
                    }
                    const packageFile = path.resolve(childPath, 'package.json');
                    const lockFile = path.resolve(childPath, 'yarn.lock');

                    if (fs.existsSync(packageFile)) {
                        if (useNpm) {
                            this.runNpm(childPath);
                        } else { // use npm
                            if (fs.existsSync(lockFile)) {
                                await this.downloadDeps(childPath);
                            } else {
                                this.logger.info('No yarn.lock file existed under: ' + childPath + ', consider enabled npm downloading.');
                            }
                        }
                    } else {
                        await this.downloadDepsRecurisively(childPath, useNpm);
                    }
                }
            }
        } catch (e) {
            this.logger.error(e);
        }
    }

    public async downloadFile(url: URL, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const lib = url.protocol.startsWith('https') ? https : http;
            const request = lib.get(url, (response: http.IncomingMessage) => {
                if (!response.statusCode || response.statusCode < 200 || response.statusCode > 299) {
                    reject(new Error('Failed to load page, status code: ' + response.statusCode));
                }

                const extractorStream: internal.Writable = gunzip();
                const untarStream = tarFs.extract(dest, {
                    ignore: (name, header) => {
                        if (path.extname(name) === '.bin') {
                            return true
                        }
                        if (!header) {
                            return true;
                        }
                        return header.type !== 'file' && header.type !== 'directory'; // symlink
                    },
                    // @ts-ignore
                    strip: 1,
                    dmode: 0o755, // all dirs should be readable
                    fmode: 0o644, // all files should be readable
                    chown: false, // don't chown. just leave as it is
                    // map: header => {
                    //     header.mtime = now;
                    //     return header;
                    // },
                    // fs: patchedFs,
                });

                response.pipe(extractorStream).pipe(untarStream).on('finish', () => resolve());
                // response.on('end', () => resolve());
            });
            // handle connection errors of the request
            request.on('error', (err: Error) => reject(err))
        })
    };

    public async downloadDeps(lockFileDir: string): Promise<void> {
        const moduleCachePath = path.resolve(this.cachePath, 'Yarn', 'simple');
        const nodeModulePath = path.resolve(lockFileDir, 'node_modules');

        if (!fs.existsSync(moduleCachePath)) {
            fs.mkdirSync(moduleCachePath,  { recursive: true });
        }

        const lockfile = await Lockfile.fromDirectory(lockFileDir);
        for (const p in lockfile.cache) {
            if (p in lockfile.cache) { // TODO can we avoid this?
                try {
                    const packageInfo = lockfile.cache[p];
                    const url = new URL(packageInfo.resolved);
                    // Get path like $data/code/cache/node/Yarn/simple/typescript-3.5.3-c830f657f93f1ea846819e929092f5fe5983e977
                    // similar to yarn's $data/code/cache/node/Yarn/simple/v4/npm-typescript-3.3.4000-76b0f89cfdbf97827e1112d64f283f1151d6adf0
                    const cacheDest = path.resolve(moduleCachePath, path.basename(url.pathname, '.tgz') + '-' + url.hash.substr(1));

                    // TODO try look at Yarn/v4 folder
                    const dest = path.resolve(nodeModulePath, p.split('@')[0]);
                    if (!fs.existsSync(dest)) {
                        // TODO maybe check integrity and delete the zip that doesn't pass the check
                        // TODO allow multiple thread to download deps
                        this.logger.log('Downloading: ' + p);
                        if (!fs.existsSync(cacheDest)) {
                            await this.downloadFile(url, cacheDest);
                        }
                        fsExtra.copySync(cacheDest, dest)
                    }
                } catch (e) {
                    this.logger.error(e)
                }
            }
        }
    }
}

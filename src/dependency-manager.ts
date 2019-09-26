import { Logger } from './logging';

import { spawnSync } from 'child_process'
import * as fs from 'mz/fs';
import { resolve } from 'path';
// import * as rimraf from 'rimraf';
// import { promisify } from 'util';

export class DependencyManager {
    // private rimrafAysnc = promisify(rimraf);

    constructor(readonly rootPath: string, readonly logger: Logger, readonly gitHostWhitelist: string[]) { }

    public installDependency(): void {
        try {
            this.runNpm()
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

    public runNpm(): void {
        const env = Object.create(process.env);
        env.TERM = 'dumb';

        const cwd = this.rootPath;
        // let cmd = 'yarn';
        //
        // if (existsSync(resolve(cwd, 'package-lock.json'))) {
        //     cmd = 'npm'
        // }
        if (!fs.existsSync(resolve(cwd, 'package.json'))) {
            return
        }

        const yarnScript = require.resolve('yarn/bin/yarn.js');
        // console.error('Yarn script location' + yarnScript);

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
}

import * as core from '@actions/core';
import * as fs from 'fs';
import { promisify } from 'util';

import {
    SSMClient,
    GetParametersByPathCommand,
    Parameter,
} from '@aws-sdk/client-ssm';

import { Input } from './input.enum';

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const ssmClient = new SSMClient({});

async function getParametersByEnvironment(env: string): Promise<Parameter[]> {
    const params: Parameter[] = [];

    let nextToken: string | undefined;
    while (true) {
        const cmd = new GetParametersByPathCommand({
            Path: `/${env}`,
            Recursive: true,
            NextToken: nextToken,
        });

        const cmdResult = await ssmClient.send(cmd);
        params.push(...(cmdResult.Parameters ?? []));

        nextToken = cmdResult.NextToken;
        if (!cmdResult.NextToken) {
            break;
        }
    }

    return params;
}

function buildEnv(
    selectedEnv: string,
    envTemplate: string,
    parameters: Parameter[],
) {
    let env = envTemplate;

    env = env.replace(`%ENV%`, `"${selectedEnv}"`);
    for (const param of parameters) {
        const paramKey = param.Name?.replace(`/${selectedEnv}`, '');
        const paramValue = param.Value?.trim();

        env = env.replace(`%${paramKey}%`, `"${paramValue}"`);
    }

    return env;
}

(async () => {
    // const environment = `dev`;
    const environment = core.getInput(Input.ENVIRONMENT);

    core.info(`Building .env for "${environment}" environment...`);

    try {
        core.info(`Reading .env.template...`);
        const envTemplateBuffer = await readFile(
            `${process.cwd()}/.env.template`,
        );

        core.info(`Fetching parameters from SSM Parameter Store...`);
        const parameters = await getParametersByEnvironment(environment);

        core.info(`Building .env...`);
        const envContent = buildEnv(
            environment,
            envTemplateBuffer.toString(),
            parameters,
        );

        await writeFile(`${process.cwd()}/.env`, envContent);

        core.info(
            `.env for "${environment}" environment has been built successfully!`,
        );
    } catch (e) {
        core.setFailed(e as any);
    }
})();

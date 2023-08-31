import type { AWS } from '@serverless/typescript';

const serverlessConfiguration: AWS = {
  service: 'compound-kit-api',
  frameworkVersion: '3',
  plugins: ['serverless-esbuild', 'serverless-offline', 'serverless-plugin-warmup'],
  provider: {
    name: 'aws',
    runtime: 'nodejs16.x',
    stage: '${opt:stage}',
    apiName: '${self:service}-${self:provider.stage}',
    apiGateway: {
      minimumCompressionSize: 1024,
      shouldStartNameWithService: true,
      usagePlan: { throttle: { burstLimit: 30, rateLimit: 60 } },
    },
    environment: {
      AWS_NODEJS_CONNECTION_REUSE_ENABLED: '1',
      NODE_OPTIONS: '--enable-source-maps --stack-trace-limit=1000',
    },
  },
  package: { individually: true },
  custom: {
    esbuild: {
      bundle: true,
      minify: false,
      sourcemap: true,
      exclude: ['aws-sdk'],
      target: 'node16',
      define: { 'require.resolve': undefined },
      platform: 'node',
      concurrency: 10,
    },
    warmup: {
      default: {
        enabled: true,
        timeout: 60,
        prewarm: true,
      },
    },
  },
  functions: {
    api: {
      name: '${self:service}-${self:provider.stage}',
      handler: 'src/index.handler',
      timeout: 30,
      memorySize: 256,
      events: [{ http: { path: '/{proxy+}', method: 'any', cors: true } }],
      environment: {
        STAGE: '${self:provider.stage}',
      },
    },
  },
};

module.exports = serverlessConfiguration;

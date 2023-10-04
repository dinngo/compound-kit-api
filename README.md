# Compound Kit API

[![Lint](https://github.com/dinngo/compound-kit-api/actions/workflows/lint.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/lint.yml)
[![Unit Test](https://github.com/dinngo/compound-kit-api/actions/workflows/unit-test.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/unit-test.yml)
[![E2E Test](https://github.com/dinngo/compound-kit-api/actions/workflows/e2e-test.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/e2e-test.yml)

Compound Kit empowers developers to rapidly build intent-centric applications and enhances the user experience for the Compound protocol. This repository includes the Compound Kit API service.

You can try the API at [SwaggerHub](https://compound-kit-api.protocolink.com/docs) and find more details at [Compound Kit Overview](https://docs.protocolink.com/compound-kit/overview).

## Run Offline

```sh
yarn sls offline -s local
```

## Hardhat e2e testing

```sh
yarn hardhat test $TEST_FILE
```

## Deployment

```sh
yarn sls deploy -r us-east-1 -s $STAGE
```

# CompoundKit API

[![Lint](https://github.com/dinngo/compound-kit-api/actions/workflows/lint.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/lint.yml)
[![Unit Test](https://github.com/dinngo/compound-kit-api/actions/workflows/unit-test.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/unit-test.yml)
[![E2E Test](https://github.com/dinngo/compound-kit-api/actions/workflows/e2e-test.yml/badge.svg)](https://github.com/dinngo/compound-kit-api/actions/workflows/e2e-test.yml)

The API service for composable router

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

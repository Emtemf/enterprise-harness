# API Contract Rules

## Contract ownership

Every service that exposes an API must own an OpenAPI / YAML contract file.

For the local MVP, the reference location is:

- `reference-service/openapi/order-service.yaml`

## Required consistency

The contract and implementation must stay aligned for:

- path
- HTTP method
- request DTO shape
- response DTO shape
- error model summary

## Validation expectation

Local hooks must validate:

- the YAML file exists
- the YAML contains core sections
- controller path/method markers match the contract markers

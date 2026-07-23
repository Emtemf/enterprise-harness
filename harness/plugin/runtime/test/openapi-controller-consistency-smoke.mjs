import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const mode = process.argv[2];
const { validateGenericControllerConsistency } = await import('../lib/checks.mjs');

function readText(file) {
  return fs.readFileSync(file, 'utf-8');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function pass(message) {
  console.log(message);
  process.exit(0);
}

if (!['red', 'green', 'verify'].includes(mode)) {
  console.error('Usage: node harness/plugin/runtime/test/openapi-controller-consistency-smoke.mjs <red|green|verify>');
  process.exit(1);
}

// ── Helper: create temp project structure ──
function createFixture(scenario) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openapi-controller-smoke-'));

  if (scenario === 'aligned') {
    // YAML and Controller are perfectly aligned
    fs.mkdirSync(path.join(tmpDir, 'openapi'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'openapi', 'order-service.yaml'), `
openapi: 3.0.3
paths:
  /api/orders/{orderId}/cancel:
    post:
      operationId: cancelOrder
      requestBody:
        content:
          application/json:
            schema:
              \$ref: '#/components/schemas/CancelOrderRequest'
components:
  schemas:
    CancelOrderRequest:
      type: object
      properties:
        reason:
          type: string
`);
    const ctrlDir = path.join(tmpDir, 'src', 'main', 'java', 'com', 'example', 'api');
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.writeFileSync(path.join(ctrlDir, 'OrderController.java'), `
package com.example.api;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PostMapping("/{orderId}/cancel")
    public CancelOrderResponse cancelOrder(@PathVariable String orderId, @RequestBody CancelOrderRequest request) {
        return null;
    }
}
`);
  }

  if (scenario === 'path-mismatch') {
    // YAML has /api/orders/{orderId}/cancel but Controller has /api/orders/{orderId}/delete
    fs.mkdirSync(path.join(tmpDir, 'openapi'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'openapi', 'order-service.yaml'), `
openapi: 3.0.3
paths:
  /api/orders/{orderId}/cancel:
    post:
      operationId: cancelOrder
components:
  schemas: {}
`);
    const ctrlDir = path.join(tmpDir, 'src', 'main', 'java', 'com', 'example', 'api');
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.writeFileSync(path.join(ctrlDir, 'OrderController.java'), `
package com.example.api;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @DeleteMapping("/{orderId}/delete")
    public void deleteOrder(@PathVariable String orderId) {}
}
`);
  }

  if (scenario === 'method-mismatch') {
    // YAML says POST, Controller says GET
    fs.mkdirSync(path.join(tmpDir, 'openapi'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'openapi', 'order-service.yaml'), `
openapi: 3.0.3
paths:
  /api/orders/{orderId}:
    get:
      operationId: getOrder
components:
  schemas: {}
`);
    const ctrlDir = path.join(tmpDir, 'src', 'main', 'java', 'com', 'example', 'api');
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.writeFileSync(path.join(ctrlDir, 'OrderController.java'), `
package com.example.api;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/orders")
public class OrderController {

    @PostMapping("/{orderId}")
    public OrderResponse getOrder(@PathVariable String orderId) {
        return null;
    }
}
`);
  }

  if (scenario === 'no-openapi') {
    // No openapi directory at all — should be no-op
    const ctrlDir = path.join(tmpDir, 'src', 'main', 'java', 'com', 'example', 'api');
    fs.mkdirSync(ctrlDir, { recursive: true });
    fs.writeFileSync(path.join(ctrlDir, 'OrderController.java'), `
@RestController
@RequestMapping("/api/orders")
public class OrderController {}
`);
  }

  if (scenario === 'no-controllers') {
    // Has openapi but no controllers — should be no-op
    fs.mkdirSync(path.join(tmpDir, 'openapi'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'openapi', 'order-service.yaml'), `
openapi: 3.0.3
paths:
  /api/orders:
    get:
      operationId: listOrders
components:
  schemas: {}
`);
  }

  return tmpDir;
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
}

// ── Test execution ──
const failures = [];

if (mode === 'red') {
  // RED: validateGenericControllerConsistency should NOT exist yet
  if (typeof validateGenericControllerConsistency !== 'function') {
    pass('Red precondition holds: validateGenericControllerConsistency not yet implemented.');
  } else {
    fail('validateGenericControllerConsistency already exists — red precondition no longer holds.');
  }
}

if (mode === 'green' || mode === 'verify') {
  // GREEN/VERIFY: run all scenarios

  // 1. Aligned: should return empty
  const aligned = createFixture('aligned');
  try {
    const errors = validateGenericControllerConsistency(aligned);
    if (errors.length > 0) failures.push(`aligned scenario should pass but got: ${errors.join(', ')}`);
  } finally { cleanup(aligned); }

  // 2. Path mismatch: should detect at least one mismatch
  const pathMismatch = createFixture('path-mismatch');
  try {
    const errors = validateGenericControllerConsistency(pathMismatch);
    if (errors.length === 0) failures.push(`path-mismatch scenario should report errors but got none`);
  } finally { cleanup(pathMismatch); }

  // 3. Method mismatch: should detect at least one mismatch
  const methodMismatch = createFixture('method-mismatch');
  try {
    const errors = validateGenericControllerConsistency(methodMismatch);
    if (errors.length === 0) failures.push(`method-mismatch scenario should report errors but got none`);
  } finally { cleanup(methodMismatch); }

  // 4. No openapi: should be no-op
  const noOpenapi = createFixture('no-openapi');
  try {
    const errors = validateGenericControllerConsistency(noOpenapi);
    if (errors.length > 0) failures.push(`no-openapi scenario should be no-op but got: ${errors.join(', ')}`);
  } finally { cleanup(noOpenapi); }

  // 5. No controllers: should be no-op
  const noControllers = createFixture('no-controllers');
  try {
    const errors = validateGenericControllerConsistency(noControllers);
    if (errors.length > 0) failures.push(`no-controllers scenario should be no-op but got: ${errors.join(', ')}`);
  } finally { cleanup(noControllers); }

  // 6. reference-service regression: still should pass
  const refErrors = validateGenericControllerConsistency(repoRoot);
  const refPathErrors = refErrors.filter((e) => e.includes('openapi-controller:'));
  if (refPathErrors.length > 0) failures.push(`reference-service regression should pass but got: ${refPathErrors.join(', ')}`);
}

if (mode === 'red') {
  process.exit(0);
}

if (failures.length > 0) {
  fail(`Expected generic OpenAPI-Controller consistency check to pass:\n${failures.join('\n')}`);
}

pass(mode === 'green' ? 'Green openapi-controller-consistency smoke passed.' : 'Openapi-controller-consistency verify smoke passed.');

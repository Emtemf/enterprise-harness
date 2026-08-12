import path from 'node:path';
import { canonicalPath, pathIsWithin } from './safe-paths.mjs';

export function controllerDescriptor(subjectRoot, options = {}) {
  const subject = path.resolve(options.subjectRoot || subjectRoot);
  const controller = path.resolve(options.controllerRoot || process.env.ENTERPRISE_HARNESS_CONTROLLER_ROOT || path.join(subject, '.enterprise-harness-controller'));
  return Object.freeze({
    schemaVersion: 1,
    controllerRoot: controller,
    subjectRoot: subject,
    source: options.source || 'released-controller',
    controllerRevision: options.controllerRevision || process.env.ENTERPRISE_HARNESS_CONTROLLER_REVISION || 'unknown',
  });
}

export function assertControllerSubjectBoundary(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error('EH-CONTROLLER-SUBJECT-001: controller descriptor is required');
  }
  const controller = canonicalPath(descriptor.controllerRoot);
  const subject = canonicalPath(descriptor.subjectRoot);
  if (controller === subject || pathIsWithin(controller, subject) || pathIsWithin(subject, controller)) {
    throw new Error('EH-CONTROLLER-SUBJECT-001: controller and subject must be separate non-containing roots');
  }
  return true;
}

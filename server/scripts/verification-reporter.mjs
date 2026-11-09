export default class ProgressReporter {
 onTestModuleStart(m) { process.stdout.write('MODULE ' + m.moduleId + '\n'); }
 onTestCaseReady(t) { process.stdout.write('START ' + t.fullName + '\n'); }
 onTestCaseResult(t) { process.stdout.write('DONE ' + t.fullName + ' ' + JSON.stringify(t.result()) + '\n'); }
}

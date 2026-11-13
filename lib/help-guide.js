// Button paths are shared with the live UI, so guide labels follow the selected language.
export const helpSections=[
 {id:'access',actions:['teamAuth.register',null,'shell.reactivate','teamAuth.remember']},
 {id:'navigation',actions:['shell.today','moulds',null,'vendors']},
 {id:'newMould',actions:['workflow.newMould','workflow.createMould']},
 {id:'bom',actions:['bom.addBom','bom.addFiles','bom.confirm','bom.useFile','gemini.read','bom.confirm']},
 {id:'receiving',actions:['receiving.title','receiving.add','receiving.history','receiving.verify','receiving.issue']},
 {id:'planning',actions:['planning.title','planning.plan','planning.route','processes.add','planning.sendNow','planning.allot']},
 {id:'work',actions:['planning.work','planning.start','planning.complete','planning.saveReturns','planning.history']},
 {id:'dates',actions:[null,null,null]},
 {id:'sharing',actions:['planning.planExport.download','planning.planExport.share','shell.export']},
 {id:'trials',actions:['trials.assemble','trials.record','trials.resolve','trials.finish']},
 {id:'people',actions:['settings','shell.users','shell.reactivate',null]},
 {id:'cleanup',actions:['admin.title','admin.edit','admin.remove','admin.restore']},
 {id:'personal',actions:['language','appearance.title','changePin',null]},
 {id:'offline',actions:[null,null,null,null]},
 {id:'daily',actions:['shell.today','receiving.title','planning.work','shell.alerts']}
];

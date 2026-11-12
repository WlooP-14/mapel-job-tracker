export function defaultProcesses(stages,routes,category,material){
 const matching=routes.filter(route=>route.category===category&&route.material.trim().toLowerCase()===material?.trim().toLowerCase());
 const available=stages.filter(stage=>stage.category===category&&stage.step_name!=='Received');
 return available.filter(stage=>matching.length?matching.some(route=>route.step_name===stage.step_name):stage.default_selected!==false).map(stage=>stage.step_name);
}

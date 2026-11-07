const actions = {
 newMould: ['workflow.newMould', 'workflow.createMould'],
 bom: ['bom.addBom', 'bom.addFiles', 'bom.confirm', 'bom.useFile'],
 receiving: ['receiving.add', 'receiving.receiveRemaining', 'receiving.save', 'receiving.verify', 'receiving.issue'],
 planning: ['planning.plan', 'planning.title', 'planning.sendNow', 'planning.allot'],
 work: ['planning.work', 'planning.start', 'planning.complete', 'planning.saveReturns'],
 trials: ['trials.assemble', 'trials.record', 'trials.resolve', 'trials.finish'],
 settings: ['shell.addUser', 'shell.addHoliday', 'shell.addRoute', 'shell.export']
};

export const guideTitles = {
 newMould: 'workflow.newMould',
 bom: 'bom.addBom',
 receiving: 'receiving.title',
 planning: 'planning.title',
 work: 'planning.work',
 trials: 'trials.title',
 settings: 'settings'
};

export function guideLabel(t, path) {
 return path.split('.').reduce((value, key) => value[key], t).replace(/\s*\(?\{\w+\}\)?/g, '');
}

export default function ActionGuide({ t, topic, title }) {
 return (
  <details className="panel">
   <summary className="font-bold cursor-pointer">{title || t.guides.open}</summary>
   <ol className="list-decimal space-y-3 pl-6 pb-2">
    {actions[topic].map((path, index) => (
     <li key={path}>
      <strong>{guideLabel(t, path)}</strong>
      <p>{t.guides[topic][index]}</p>
     </li>
    ))}
   </ol>
  </details>
 );
}

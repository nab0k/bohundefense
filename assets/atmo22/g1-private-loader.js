/** BOHUN G1: local review overlay; never available on production hosts. */
const LOCAL_HOSTS = new Set(['localhost','127.0.0.1','[::1]']);
export function isG1Local(hostname) { return LOCAL_HOSTS.has(hostname); }
export function checkPrivateReview(vm, candidateId) {
  if (!vm || typeof vm !== 'object' || Array.isArray(vm)) throw Error('Invalid private view model');
  const audit = vm._bridge_audit;
  if (audit?.status !== 'INTERNAL_ONLY_NOT_FOR_SITE' ||
      audit?.public_release !== false || audit?.qa_approved !== false ||
      audit?.candidate_id !== Number(candidateId) || !vm.name ||
      !vm.facts || !Array.isArray(vm.evidence) || !vm.taxonomy ||
      !vm.relationships || !vm.programmes) throw Error('G1 private QA gate failed');
  return vm;
}
export async function loadPrivateReviewVM(candidateId, {hostname, fetcher} = {}) {
  if (!isG1Local(hostname || '')) return null;
  const key=String(candidateId || '');
  if (!/^[1-9][0-9]{0,7}$/.test(key)) throw Error('Invalid candidate ID');
  const get=fetcher || fetch;
  const response=await get('/__g1_review/'+key+'.json',{
    cache:'no-store',credentials:'omit',redirect:'error'
  });
  if (!response.ok) throw Error('Review model is unavailable');
  return checkPrivateReview(await response.json(),key);
}

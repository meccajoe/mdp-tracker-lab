import {QuoteAccessGate} from '@/components/quote-access-gate';
import {ProjectCapacity} from '@/components/project-capacity';
export default async function ProjectCapacityPage({params}:{params:Promise<{workspaceId:string}>}){
  const {workspaceId}=await params;
  return <QuoteAccessGate><ProjectCapacity workspaceId={workspaceId}/></QuoteAccessGate>;
}

import LeadSection from '../components/LeadSection';

export default function PotentialLeads() {
  return (
    <LeadSection
      status="Potential"
      sectionName="Potential Leads"
      agentId="8544b52f-bc03-43b9-af64-dad418172f3d"
      title="Potential Leads"
      description="Leads marked as potential that require first contact. Filtered from leads_master where status = 'Potential'."
      emptyMessage="No potential leads found."
    />
  );
}

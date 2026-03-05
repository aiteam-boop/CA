import LeadSection from '../components/LeadSection';

export default function PotentialLeads() {
  return (
    <LeadSection
      status="Potential"
      sectionName="Potential Leads"
      agentId="30625f51-f66e-40c9-9d58-bfab7674c93c"
      title="Potential Leads"
      description="Leads marked as potential that require first contact. Filtered from leads_master where status = 'Potential'."
      emptyMessage="No potential leads found."
    />
  );
}

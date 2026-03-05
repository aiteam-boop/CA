import LeadSection from '../components/LeadSection';

export default function FollowUps() {
  return (
    <LeadSection
      status="Followup"
      sectionName="Follow-ups"
      agentId="8544b52f-bc03-43b9-af64-dad418172f3d"
      title="Follow-up Leads"
      description="Leads that require a follow-up call. Filtered from leads_master where status = 'Followup'."
      emptyMessage="No follow-up leads found."
    />
  );
}

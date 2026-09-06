import SEOHead from '@/components/common/SEOHead';
import EducationHub from '@/components/eduHub/EducationHub';

export default function LearnPage() {
  return (
    <>
      <SEOHead
        title="Learn & Earn"
        description="Get to know your community through short learning modules and quizzes."
        path="/learn"
        noIndex
      />
      <EducationHub />
    </>
  );
}

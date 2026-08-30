import { Routes, Route } from 'react-router-dom';
import StudentSandbox from './StudentSandbox';
import TeacherDashboard from './TeacherDashboard';
import ErrorBoundary from './ErrorBoundary';
import { Analytics } from '@vercel/analytics/react';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<StudentSandbox />} />
        <Route path="/dashboard" element={<TeacherDashboard />} />
      </Routes>
      <Analytics />
    </ErrorBoundary>
  );
}

export default App;

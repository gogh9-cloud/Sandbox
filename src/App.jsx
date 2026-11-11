import { Routes, Route } from 'react-router-dom';
import StudentSandbox from './StudentSandbox';
import TeacherDashboard from './TeacherDashboard';
import ErrorBoundary from './ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/" element={<StudentSandbox />} />
        <Route path="/dashboard" element={<TeacherDashboard />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;

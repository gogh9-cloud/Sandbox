import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          fontFamily: 'sans-serif',
          padding: '20px',
          textAlign: 'center'
        }}>
          <h2 style={{ fontSize: '24px', marginBottom: '12px' }}>앗, 일시적인 화면 오류가 발생했습니다 😅</h2>
          <p style={{ color: '#94a3b8', marginBottom: '24px' }}>아래 버튼을 눌러 화면을 즉시 복구할 수 있습니다.</p>
          <button
            onClick={this.handleReload}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              backgroundColor: '#8b5cf6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            화면 새로고침 및 복구
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

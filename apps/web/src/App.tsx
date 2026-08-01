import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';

import { AuthProvider } from '@/features/auth/provider';
import { queryClient } from '@/lib/query-client';
import { router } from '@/router';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;

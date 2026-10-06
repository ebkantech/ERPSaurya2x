import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/layout/Layout'
import ProjectSites     from './pages/projects/ProjectSites'
import SiteCreate       from './pages/projects/SiteCreate'
import SiteAssessment   from './pages/projects/SiteAssessment'
import Login         from './pages/Login'
import Dashboard     from './pages/Dashboard'
import VendorList    from './pages/vendors/VendorList'
import VendorDetail  from './pages/vendors/VendorDetail'
import VendorCreate  from './pages/vendors/VendorCreate'
import POList        from './pages/purchase-orders/POList'
import PODetail      from './pages/purchase-orders/PODetail'
import POCreate      from './pages/purchase-orders/POCreate'
import ProcurementDashboard from './pages/purchase-orders/ProcurementDashboard'
import POBulkGenerator      from './pages/purchase-orders/POBulkGenerator'
import DeliveryList  from './pages/deliveries/DeliveryList'
import PaymentList   from './pages/payments/PaymentList'
import ProjectList   from './pages/projects/ProjectList'
import ProjectCreate from './pages/projects/ProjectCreate'
import ProjectWorkStructure from './pages/projects/ProjectWorkStructure'
import QualityControl from './pages/operations/QualityControl' 
import BudgetVsActual from './pages/operations/BudgetVsActual'
import MaterialList  from './pages/materials/MaterialList'
import QuotationList   from './pages/materials/QuotationList'
import QuotationBuilder from './pages/materials/QuotationBuilder'
import QuotationDetail  from './pages/materials/QuotationDetail'
import QuotationPreview from './pages/materials/QuotationPreview'
import TransportList from './pages/transport/TransportList'
import TaskList      from './pages/tasks/TaskList'
import ReportsList   from './pages/reports/ReportsList'
import NotificationsList from './pages/notifications/NotificationsList'
import AdminPanel    from './pages/administration/AdminPanel'
import AssistantPage from './pages/assistant/AssistantPage'
import NotFound      from './pages/NotFound'

import VendorControlLayout    from './pages/vendor-control/VendorControlLayout'
import VendorControlDashboard from './pages/vendor-control/VendorControlDashboard'
import StaffMaster            from './pages/vendor-control/StaffMaster'
import AssignmentList         from './pages/vendor-control/AssignmentList'
import BulkAssignment         from './pages/vendor-control/BulkAssignment'
import Distribution           from './pages/vendor-control/Distribution'
import AssignmentHistory      from './pages/vendor-control/AssignmentHistory'
import StaffPerformance       from './pages/vendor-control/StaffPerformance'
import VendorQueue            from './pages/vendor-control/VendorQueue'
import VendorControlDetail    from './pages/vendor-control/VendorControlDetail'
import TaskCenter             from './pages/vendor-control/TaskCenter'
import Followups              from './pages/vendor-control/Followups'
import DailyWorkProgress from './pages/operations/DailyWorkProgress'

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Dashboard />} />

            {/* Procurement */}
            <Route path="vendors"                element={<VendorList />}    />
            <Route path="vendors/new"            element={<VendorCreate />}  />
            <Route path="vendors/:id"            element={<VendorDetail />}  />
            <Route path="purchase-orders"        element={<POList />}        />
            <Route path="purchase-orders/new"    element={<POCreate />}      />
            <Route path="purchase-orders/dashboard"     element={<ProcurementDashboard />} />
            <Route path="purchase-orders/bulk-generate" element={<POBulkGenerator />}      />
            <Route path="purchase-orders/:id"    element={<PODetail />}      />
            <Route path="deliveries"             element={<DeliveryList />}  />
            <Route path="payments"               element={<PaymentList />}   />

            {/* Operations */}
            <Route path="projects"               element={<ProjectList />}   />
            <Route path="projects/new"           element={<ProjectCreate />} />
            <Route path="projects/:projectId/sites"          element={<ProjectSites />}   />
            <Route path="projects/:projectId/sites/new"      element={<SiteCreate />}     />
            <Route path="projects/:projectId/sites/:siteId"  element={<SiteAssessment />} />
            <Route path="work-structure/:projectId" element={<ProjectWorkStructure />} />
            <Route path="operations/daily-progress" element={<DailyWorkProgress />} />
            <Route path="operations/quality" element={<QualityControl />} />
            <Route path="operations/budget" element={<BudgetVsActual />} />
            <Route path="materials"              element={<MaterialList />}  />
            <Route path="materials/quotations"     element={<QuotationList />}    />
            <Route path="materials/quotations/new" element={<QuotationBuilder />} />
            <Route path="materials/quotations/:id" element={<QuotationDetail />}  />
            <Route path="materials/quotations/:id/preview" element={<QuotationPreview />} />
            <Route path="transport"              element={<TransportList />} />
            <Route path="tasks"                  element={<TaskList />}      />

            {/* Analytics */}
            <Route path="reports"                element={<ReportsList />}       />
            <Route path="notifications"          element={<NotificationsList />} />

            {/* AI Assistant */}
            <Route path="assistant"              element={<AssistantPage />} />

            {/* System */}
            <Route path="administration"         element={<AdminPanel />}    />

            {/* Vendor Authorization (staff assignment) */}
            <Route path="vendor-control" element={<VendorControlLayout />}>
              <Route index                   element={<VendorControlDashboard />} />
              <Route path="staff"            element={<StaffMaster />}            />
              <Route path="assignments"      element={<AssignmentList />}         />
              <Route path="assignments/bulk" element={<BulkAssignment />}         />
              <Route path="distribution"     element={<Distribution />}           />
              <Route path="history"          element={<AssignmentHistory />}      />
              <Route path="performance"      element={<StaffPerformance />}       />
              <Route path="vendors"          element={<VendorQueue />}            />
              <Route path="vendors/:vendorId" element={<VendorControlDetail />}   />
              <Route path="tasks"            element={<TaskCenter />}             />
              <Route path="followups"        element={<Followups />}              />
            </Route>

            <Route path="*"                      element={<NotFound />}      />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

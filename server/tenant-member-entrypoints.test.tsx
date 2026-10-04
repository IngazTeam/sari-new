import {CalendarConnectionCard} from '../client/src/components/merchant/CalendarConnectionCard';
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ar from "../client/src/locales/ar.json";
import en from "../client/src/locales/en.json";
const state = vi.hoisted(() => ({ language: "en" }));
vi.mock(
  "@/lib/trpc",
  () => import("../prototypes/tenant-dashboard/src/service-preview-api")
);
vi.mock(
  "wouter",
  () => import("../prototypes/tenant-dashboard/src/service-preview-router")
);
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: state.language },
    t: (key: string) =>
      key
        .split(".")
        .reduce((o: any, k) => o?.[k], state.language === "ar" ? ar : en) ||
      key,
  }),
}));
import Page0 from '../client/src/pages/DiscountCodes';
import Page1 from '../client/src/pages/BookingsManagement';
import Page2 from '../client/src/pages/ByaanDashboard';
import Page3 from '../client/src/pages/CalendarSettings';
import Page4 from '../client/src/pages/CalendarPage';
import Page5 from '../client/src/pages/PlatformIntegrations';
import Page6 from '../client/src/pages/ServiceDetails';
import Page7 from '../client/src/pages/SallaIntegration';
import Page8 from '../client/src/pages/StaffManagement';
import Page9 from '../client/src/pages/ZidCallback';
import Page10 from '../client/src/pages/merchant/AbandonedCartsPage';
import Page11 from '../client/src/pages/merchant/ByaanIntegration';
import Page12 from '../client/src/pages/merchant/CalendlyIntegration';
import Page13 from '../client/src/pages/merchant/OccasionCampaignsPage';
import Page14 from '../client/src/pages/merchant/OrderNotificationsSettings';
import Page15 from '../client/src/pages/merchant/MediaLibrary';
import Page16 from '../client/src/pages/merchant/Promotions';
import Page17 from '../client/src/pages/merchant/Referrals';
import Page18 from '../client/src/pages/merchant/ScheduledMessages';
import Page19 from '../client/src/pages/merchant/ServicesManagement';
import Page20 from '../client/src/pages/merchant/ServiceForm';
import { ReviewPage as Page21 } from '../client/src/components/merchant/ReviewPage';
import { ServiceCollectionPage as Page22 } from '../client/src/components/merchant/ServiceCollectionPage';
import { WooWorkspacePage as Page23 } from '../client/src/components/merchant/WooWorkspacePage';
import { ZidWorkspacePage as Page24 } from '../client/src/components/merchant/ZidWorkspacePage';
import { ServicePreviewContext } from '../prototypes/tenant-dashboard/src/service-preview-api';
import { ServicePreviewModel } from '../prototypes/tenant-dashboard/src/service-preview-model';
let root:Root,host:HTMLDivElement,model:ServicePreviewModel;
beforeEach(()=>{vi.stubGlobal('React',React);(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;state.language='en';sessionStorage.clear();host=document.createElement('div');document.body.append(host);root=createRoot(host);model=new ServicePreviewModel(269,'readonly');});
afterEach(async()=>{await act(async()=>root.unmount());model.dispose();host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const cases = [['DiscountCodes','/merchant/discounts',<Page0/>],
['BookingsManagement','/merchant/bookings',<Page1/>],
['ByaanDashboard','/merchant/byaan-dashboard',<Page2/>],
['CalendarSettings','/merchant/calendar/settings',<Page3/>],
['CalendarPage','/merchant/calendar',<Page4/>],
['PlatformIntegrations','/merchant/platform-integrations',<Page5/>],
['ServiceDetails','/merchant/services/1',<Page6/>],
['SallaIntegration','/merchant/salla',<Page7/>],
['StaffManagement','/merchant/staff',<Page8/>],
['ZidCallback','/merchant/zid/callback',<Page9/>],
['AbandonedCartsPage','/merchant/abandoned-carts',<Page10/>],
['ByaanIntegration','/merchant/integrations/byaan',<Page11/>],
['CalendlyIntegration','/merchant/integrations/calendly',<Page12/>],
['OccasionCampaignsPage','/merchant/occasion-campaigns',<Page13/>],
['OrderNotificationsSettings','/merchant/order-notifications',<Page14/>],
['MediaLibrary','/merchant/media-library',<Page15/>],
['Promotions','/merchant/promotions',<Page16/>],
['Referrals','/merchant/referrals',<Page17/>],
['ScheduledMessages','/merchant/scheduled-messages',<Page18/>],
['ServicesManagement','/merchant/services',<Page19/>],
['ServiceForm','/merchant/services/new',<Page20/>],
['ReviewPage','/merchant/reviews',<Page21 kind="order"/>],
['ServiceCollectionPage','/merchant/service-categories',<Page22 entity="category"/>],
['WooWorkspacePage','/merchant/woocommerce/products',<Page23 view="products"/>],
['ZidWorkspacePage','/merchant/zid/products',<Page24 view="products"/>],["CalendarConnectionCard","/merchant/platform-integrations",<CalendarConnectionCard/>]] as const;
it.each(cases)('opens %s through member identity without an owner profile',async(name,path,page)=>{
 history.replaceState(null,'','/?path='+encodeURIComponent(path));const original=model.read.bind(model);
 const read=vi.spyOn(model,'read').mockImplementation((key,input)=>key==='merchants.getCurrent'?{data:undefined,error:null,isLoading:false,isFetching:false}:original(key,input));
 await act(async()=>root.render(<ServicePreviewContext.Provider value={model}>{page}</ServicePreviewContext.Provider>));
 expect(read.mock.calls.some(([key])=>key==='merchants.workspaceIdentity')).toBe(true);
 expect(read.mock.calls.some(([key])=>key==='merchants.getCurrent')).toBe(false);
 expect(host.querySelector('section[data-state="missing"]')).toBeNull();expect(model.operations).toBe(0);
});

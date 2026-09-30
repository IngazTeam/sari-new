export const trpc = {
  sariBrain: {
    getQualityDashboard: {
      useQuery() {
        throw Error("This preview cannot read or change a tenant");
      },
    },
  },
};

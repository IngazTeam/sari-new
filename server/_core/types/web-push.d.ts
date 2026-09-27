// Narrow contract used by the guarded transport; matches installed web-push 3.6.7.
declare module 'web-push' {
  const webpush: {
    generateRequestDetails(subscription:{endpoint:string;keys:{p256dh:string;auth:string}},payload:string,
      options:{TTL:number;vapidDetails:{subject:string;publicKey:string;privateKey:string}}):{
        endpoint:string;method:string;headers:Record<string,string|number>;body:Buffer|null;
      };
  };
  export default webpush;
}

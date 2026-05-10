// Set dir/lang from localStorage before React loads to prevent flash
var lng = localStorage.getItem('i18nextLng') || 'ar';
document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
document.documentElement.lang = lng;

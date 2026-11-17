// Supabase 연결 정보. 비어 있으면 사이트는 "체험 모드"(이 브라우저 안에만 저장)로 동작합니다.
// anon(public) 키는 공개되어도 되는 키입니다. 데이터 보호는 supabase/schema.sql 의 RLS 정책이 맡습니다.
window.GALLERY_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};

// Initialize Supabase client
const EMAILJS_SERVICE_ID   = 'service_wj10k4a';
const EMAILJS_TEMPLATE_ID  = 'template_upwy1af';
const EMAILJS_PUBLIC_KEY   = 'sTubhFC9MITNCHln4';

// Initialize EmailJS
emailjs.init(EMAILJS_PUBLIC_KEY);

const client = supabase.createClient(
  "https://trnqocidfcogrsjvfaqu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRybnFvY2lkZmNvZ3JzanZmYXF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM1NDU0ODEsImV4cCI6MjA3OTEyMTQ4MX0.LXZGOvhr3ECotvH3IuTJr1puYsvQ5RsYW9jA7mGW5hw"
);

// ---------- Helper: validate code against DB (case-insensitive) ----------
async function isValidCode(code) {
  if (!code) return { valid: false, message: "Enter registration code" };
  try {
    const normalized = code.trim();
    const { data, error } = await client
      .from("registration_codes")
      .select("*")
      .ilike("code", normalized)
      .maybeSingle();

    if (error) {
      console.error("Supabase error checking code:", error);
      return { valid: false, message: "Server error verifying code" };
    }
    if (!data) return { valid: false, message: "Invalid registration code" };
    if (data.used === true) return { valid: false, message: "This code has already been used" };
    return { valid: true, data };
  } catch (e) {
    console.error(e);
    return { valid: false, message: "Unknown error" };
  }
}

// ---------- Helper: upload photo to Supabase Storage ----------
async function uploadPhotoFile(file, code) {
  if (!file) return null;
  try {
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const filePath = `photos/${code}_${Date.now()}.${ext}`;
    const { error: uploadError } = await client.storage.from("photos").upload(filePath, file, { upsert: true });
    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return null;
    }
    const { data: publicUrl } = client.storage.from("photos").getPublicUrl(filePath);
    return publicUrl?.publicUrl || null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// ---------- Helper: upload event pass canvas PNG to Supabase Storage ----------
async function uploadEventPass(code, canvas) {
  if (!canvas) return null;
  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;

    const filePath = `event_passes/${code}_pass_${Date.now()}.png`;
    const { error: uploadError } = await client.storage.from("photos").upload(filePath, blob, { upsert: true });
    if (uploadError) {
      console.error("Event pass upload error:", uploadError);
      return null;
    }
    const { data: publicUrl } = client.storage.from("photos").getPublicUrl(filePath);
    return publicUrl?.publicUrl || null;
  } catch (e) {
    console.error("uploadEventPass exception:", e);
    return null;
  }
}

// ---------- NEW: Compress image for email ----------
function compressImageForEmail(canvas, maxWidth = 400, quality = 0.7) {
  return new Promise((resolve) => {
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;
    
    // Calculate new dimensions while maintaining aspect ratio
    let newWidth = originalWidth;
    let newHeight = originalHeight;
    
    if (originalWidth > maxWidth) {
      newWidth = maxWidth;
      newHeight = (originalHeight * maxWidth) / originalWidth;
    }
    
    // Create a temporary canvas for compression
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;
    
    // Draw the compressed image
    tempCtx.drawImage(canvas, 0, 0, originalWidth, originalHeight, 0, 0, newWidth, newHeight);
    
    // Convert to base64 with compression
    const compressedBase64 = tempCanvas.toDataURL('image/jpeg', quality);
    resolve(compressedBase64);
  });
}

// ---------- NEW: Send email with compressed image or download link ----------
async function sendRegistrationEmail(name, email, canvas, eventPassUrl) {
  try {
    // Option 1: Try with compressed image first
    try {
      const compressedImage = await compressImageForEmail(canvas, 400, 0.6);
      
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_name: name,
        to_email: email,
        name: name,
        event_pass: compressedImage,
        download_link: eventPassUrl || 'Available in your account'
      });
      
      showToast('Registration successful! Event Pass sent to your email.', 'success');
      return true;
    } catch (compressionError) {
      console.log("Compressed image still too large, trying without image...");
      
      // Option 2: Send without image but with download link
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_name: name,
        to_email: email,
        name: name,
        download_link: eventPassUrl || 'Please download from the registration portal',
        event_pass: null
      });
      
      showToast('Registration successful! Download link sent to your email.', 'success');
      return true;
    }
  } catch (emailErr) {
    console.error("Email send failed:", emailErr);
    
    // Option 3: If everything fails, just send a simple confirmation
    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_name: name,
        to_email: email,
        name: name,
        message: 'Your registration was successful. Please visit the registration portal to download your event pass.',
        download_link: 'https://your-portal-url.com/download'
      });
      
      showToast('Registration successful! Confirmation email sent.', 'success');
      return true;
    } catch (finalError) {
      console.error("Final email attempt failed:", finalError);
      showToast('Registration successful! But email could not be sent.', 'warning');
      return false;
    }
  }
}

/* ----------------- DOM element references ----------------- */
const userIdInput = document.getElementById('userId');
const userIdError = document.getElementById('userIdError');
const userIdSuccess = document.getElementById('userIdSuccess');
const nextBtn = document.getElementById('nextBtn');
const prevBtn = document.getElementById('prevBtn');
const prevBtn2 = document.getElementById('prevBtn2');
const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');
const step3Form = document.getElementById('step3-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const phoneInput = document.getElementById('phone');
const aadhaarInput = document.getElementById('aadhaar');
const guestTypeInput = document.getElementById('guestType');
const sendOtpBtn = document.getElementById('sendOtpBtn');
const otpSection = document.getElementById('otpSection');
const verifyOtpBtn = document.getElementById('verifyOtpBtn');
const resendOtpBtn = document.getElementById('resendOtpBtn');
const otpError = document.getElementById('otpError');
const submitBtn = document.getElementById('submitBtn');
const imageInput = document.getElementById('image');
const imageError = document.getElementById('imageError');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const eventPassContainer = document.getElementById('eventPassContainer');
const eventPass = document.getElementById('eventPass');
const passName = document.getElementById('passName');
const passId = document.getElementById('passId');
const passEmail = document.getElementById('passEmail');
const passPhone = document.getElementById('passPhone');
const passAadhaar = document.getElementById('passAadhaar');
const passGuestType = document.getElementById('passGuestType');
const passImage = document.getElementById('passImage');
const qrCode = document.getElementById('qrCode');
const downloadBtn = document.getElementById('downloadBtn');
const backBtn = document.getElementById('backBtn');
const registrationForm = document.getElementById('registrationForm');
const header = document.querySelector('.header');
const eventDetails = document.querySelector('.event-details');
const smsSimulation = document.getElementById('smsSimulation');
const smsOtp = document.getElementById('smsOtp');
const smsClose = document.getElementById('smsClose');
const overlay = document.getElementById('overlay');
const serialNumber = document.getElementById('serialNumber');
const loadingSpinner = document.getElementById('loadingSpinner');
const toast = document.getElementById('toast');
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');
const formSavedIndicator = document.getElementById('formSavedIndicator');
const adminPanel = document.getElementById('adminPanel');
const exportDataBtn = document.getElementById('exportDataBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const toggleAdminBtn = document.getElementById('toggleAdminBtn');

/* ----------------- Local browser state ----------------- */
const usedCodes = new Set(JSON.parse(localStorage.getItem('atirathUsedCodes') || '[]'));
const registeredUsers = JSON.parse(localStorage.getItem('atirathRegisteredUsers') || '[]');
let currentOtp = '';
let uploadedImageSrc = '';
let qrCodeDataURL = '';
let otpRequestCount = 0;
let lastOtpRequestTime = 0;

/* ----------------- Utilities & small helpers ----------------- */
function debounce(func, wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>func(...a), wait); }; }

function showToast(msg, type='info'){ 
  if(!toast){ console.log(msg); return; } 
  toast.textContent=msg; 
  toast.className=`toast ${type}`; 
  toast.classList.add('show'); 
  setTimeout(()=>toast.classList.remove('show'),3000); 
}

function showFormSavedIndicator(){ 
  if(!formSavedIndicator) return; 
  formSavedIndicator.style.display='block'; 
  setTimeout(()=>formSavedIndicator.style.display='none',1800); 
}

function saveUsedCodes(){ localStorage.setItem('atirathUsedCodes', JSON.stringify([...usedCodes])); }
function saveRegisteredUsers(){ localStorage.setItem('atirathRegisteredUsers', JSON.stringify(registeredUsers)); }

/* ----------------- SMS simulation ----------------- */
function showSmsSimulation(phone, otp){ smsOtp.textContent = otp; overlay.style.display='block'; smsSimulation.style.display='block'; }
function closeSmsSimulation(){ overlay.style.display='none'; smsSimulation.style.display='none'; }

/* ----------------- UI progress & steps ----------------- */
function updateProgressBar(step){
  step1.classList.remove('active','completed');
  step2.classList.remove('active','completed');
  step3.classList.remove('active','completed');
  step4.classList.remove('active','completed');
  if(step>=1) step1.classList.add('completed');
  if(step>=2) step2.classList.add('completed');
  if(step>=3) step3.classList.add('completed');
  if(step>=4) step4.classList.add('completed');
  if(step===1) step1.classList.add('active');
  if(step===2) step2.classList.add('active');
  if(step===3) step3.classList.add('active');
  if(step===4) step4.classList.add('active');
}

function goToStep(step){
  step1Form.classList.remove('active'); 
  step2Form.classList.remove('active'); 
  step3Form.classList.remove('active');
  if(step===1){ step1Form.classList.add('active'); updateProgressBar(1); }
  else if(step===2){ step2Form.classList.add('active'); updateProgressBar(2); }
  else if(step===3){ step3Form.classList.add('active'); updateProgressBar(3); otpSection.style.display='block'; }
}

function getCurrentStep(){ 
  if(step1Form.classList.contains('active')) return 1; 
  if(step2Form.classList.contains('active')) return 2; 
  if(step3Form.classList.contains('active')) return 3; 
  return 1; 
}

function saveFormProgress(){ 
  const formData={ 
    userId:userIdInput.value, 
    name:nameInput.value, 
    email:emailInput.value, 
    phone:phoneInput.value, 
    aadhaar:aadhaarInput.value, 
    guestType:guestTypeInput.value, 
    currentStep:getCurrentStep() 
  }; 
  localStorage.setItem('atirathFormProgress', JSON.stringify(formData)); 
  showFormSavedIndicator(); 
}

function loadFormProgress(){ 
  const saved=JSON.parse(localStorage.getItem('atirathFormProgress')||'{}'); 
  if(!saved) return; 
  userIdInput.value=saved.userId||''; 
  nameInput.value=saved.name||''; 
  emailInput.value=saved.email||''; 
  phoneInput.value=saved.phone||''; 
  aadhaarInput.value=saved.aadhaar||''; 
  guestTypeInput.value=saved.guestType||''; 
  if(saved.currentStep) goToStep(saved.currentStep); 
  if(userIdInput.value) validateUserId(); 
  if(nameInput.value) validateName(); 
  if(emailInput.value) validateEmail(); 
  if(phoneInput.value) validatePhone(); 
  if(aadhaarInput.value) validateAadhaar(); 
  if(guestTypeInput.value) validateGuestType(); 
}

function clearFormProgress(){ localStorage.removeItem('atirathFormProgress'); }

/* ----------------- Field helpers ----------------- */
function showFieldError(field, message){ 
  const el=document.getElementById(field.id+'Error'); 
  if(el){ el.textContent=message; el.style.display='block'; } 
  field.classList.add('input-error'); 
  field.classList.remove('input-success'); 
}

function clearFieldError(field){ 
  const el=document.getElementById(field.id+'Error'); 
  if(el) el.style.display='none'; 
  field.classList.remove('input-error'); 
  field.classList.add('input-success'); 
}

/* ----------------- Rate-limit for OTP ----------------- */
function canRequestOtp(){ 
  const now=Date.now(); 
  if(now-lastOtpRequestTime>3600000) otpRequestCount=0; 
  if(otpRequestCount>=3){ 
    showToast('Too many OTP requests. Try later','error'); 
    return false;
  } 
  otpRequestCount++; 
  lastOtpRequestTime = now; 
  return true; 
}

/* ----------------- Basic validators ----------------- */
function validateName(){ 
  const n=nameInput.value.trim(); 
  if(!n){ showFieldError(nameInput,'Full name is required'); return; } 
  if(n.length<2) showFieldError(nameInput,'Please enter a valid name'); 
  else clearFieldError(nameInput); 
}

function validateEmail(){ 
  const e=emailInput.value.trim(); 
  const re=/^[^\s@]+@[^\s@]+\.[^\s@]+$/; 
  if(!e){ showFieldError(emailInput,'Email is required'); return; } 
  if(!re.test(e)) showFieldError(emailInput,'Please enter a valid email address'); 
  else clearFieldError(emailInput); 
}

function validatePhone(){ 
  const p=phoneInput.value.trim(); 
  if(!p){ showFieldError(phoneInput,'Phone number is required'); return; } 
  if(!/^[0-9]{10}$/.test(p)) showFieldError(phoneInput,'Phone number must be exactly 10 digits'); 
  else clearFieldError(phoneInput); 
}

function validateAadhaar(){ 
  const a=aadhaarInput.value.trim(); 
  if(!a){ showFieldError(aadhaarInput,'Aadhaar number is required'); return; } 
  if(!/^[0-9]{12}$/.test(a)) showFieldError(aadhaarInput,'Aadhaar number must be exactly 12 digits'); 
  else clearFieldError(aadhaarInput); 
}

function validateGuestType(){ 
  if(!guestTypeInput.value) showFieldError(guestTypeInput,'Please select a guest type'); 
  else clearFieldError(guestTypeInput); 
}

/* ----------------- OTP helpers ----------------- */
function setupOtpInputs(){ 
  const otpInputs=document.querySelectorAll('.otp-inputs input'); 
  otpInputs.forEach((input, idx)=>{ 
    input.addEventListener('input', ()=>{ 
      if(input.value.length===1 && idx<otpInputs.length-1) otpInputs[idx+1].focus(); 
    }); 
    input.addEventListener('keydown', (e)=>{ 
      if(e.key==='Backspace' && input.value==='' && idx>0) otpInputs[idx-1].focus(); 
    }); 
  }); 
}

function getEnteredOtp(){ 
  return Array.from(document.querySelectorAll('.otp-inputs input')).map(i=>i.value).join(''); 
}

function clearOtpInputs(){ 
  document.querySelectorAll('.otp-inputs input').forEach(i=>i.value=''); 
  document.getElementById('otp1')?.focus(); 
  otpError.style.display='none'; 
}

/* ----------------- Image preview ----------------- */
imageInput.addEventListener('change', function(){
  const file = this.files[0];
  if(!file){ previewContainer.style.display='none'; uploadedImageSrc=''; return; }
  const valid = ['image/jpeg','image/jpg','image/png'];
  if(!valid.includes(file.type)){ imageError.textContent='Please select JPG or PNG'; imageError.style.display='block'; return; }
  if(file.size > 5*1024*1024){ imageError.textContent='Image must be < 5MB'; imageError.style.display='block'; return; }
  const reader = new FileReader();
  reader.onload = (e)=>{ previewImage.src = e.target.result; previewContainer.style.display='block'; uploadedImageSrc = e.target.result; imageError.style.display='none'; saveFormProgress(); };
  reader.readAsDataURL(file);
});

/* ----------------- validateUserId ----------------- */
async function validateUserId(){
  const code=userIdInput.value.trim();
  if(!code){ showFieldError(userIdInput,'Registration ID is required'); userIdSuccess.style.display='none'; return false; }
  const res = await isValidCode(code);
  if(!res.valid){ showFieldError(userIdInput, res.message || 'Invalid Registration ID'); userIdSuccess.style.display='none'; return false; }
  clearFieldError(userIdInput);
  userIdSuccess.textContent = 'Valid Registration ID - Click Next to continue';
  userIdSuccess.style.display = 'block';
  return true;
}

/* ----------------- Event listeners: navigation & admin ----------------- */
nextBtn.addEventListener('click', async ()=>{ if(await validateUserId()){ goToStep(2); saveFormProgress(); } });
prevBtn.addEventListener('click', ()=>{ goToStep(1); saveFormProgress(); });
prevBtn2.addEventListener('click', ()=>{ goToStep(2); saveFormProgress(); });

exportDataBtn.addEventListener('click', ()=>{ 
  if(registeredUsers.length===0){ showToast('No registrations yet','info'); return; } 
  const blob=new Blob([JSON.stringify(registeredUsers,null,2)],{type:'application/json'}); 
  const a=document.createElement('a'); 
  a.href=URL.createObjectURL(blob); 
  a.download='registrations_'+new Date().toISOString().slice(0,10)+'.json'; 
  a.click(); 
});

clearDataBtn.addEventListener('click', ()=>{ 
  if(confirm('Clear all local registration data?')){ 
    localStorage.removeItem('atirathUsedCodes'); 
    localStorage.removeItem('atirathRegisteredUsers'); 
    localStorage.removeItem('atirathFormProgress'); 
    usedCodes.clear(); 
    registeredUsers.length=0; 
    showToast('Local data cleared','info'); 
  }
});

toggleAdminBtn.addEventListener('click', ()=>{ 
  adminPanel.style.display=(adminPanel.style.display==='block')?'none':'block'; 
});

document.addEventListener('keydown',(e)=>{ 
  if(e.ctrlKey && e.shiftKey && e.key==='A'){ 
    toggleAdminBtn.click(); 
  }
});

smsClose.addEventListener('click', closeSmsSimulation);
overlay.addEventListener('click', closeSmsSimulation);

/* ----------------- OTP: send / verify / resend (simulated) ----------------- */
sendOtpBtn.addEventListener('click', async function(){
  const code = userIdInput.value.trim();
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const aadhaar = aadhaarInput.value.trim();
  const guestType = guestTypeInput.value;
  
  if(!code || !name || !email || !phone || !aadhaar || !guestType){ 
    showToast('Please fill all required fields before sending OTP','error'); 
    return; 
  }
  
  const codeCheck = await isValidCode(code);
  if(!codeCheck.valid){ showToast(codeCheck.message || 'Invalid Registration ID','error'); return; }
  if(usedCodes.has(code)){ showToast('This Registration ID has already been used','error'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('Invalid email','error'); return; }
  if(!/^[0-9]{10}$/.test(phone)){ showToast('Phone must be 10 digits','error'); return; }
  if(!/^[0-9]{12}$/.test(aadhaar)){ showToast('Aadhaar must be 12 digits','error'); return; }
  if(!imageInput.files[0]){ showToast('Please upload your photo before sending OTP','error'); return; }
  
  if(!canRequestOtp()) return;
  
  loadingSpinner.style.display='block'; 
  sendOtpBtn.disabled=true;
  currentOtp = Math.floor(100000 + Math.random()*900000).toString();
  
  setTimeout(()=>{ 
    loadingSpinner.style.display='none'; 
    sendOtpBtn.disabled=false; 
    goToStep(3); 
    setTimeout(()=>showSmsSimulation(phone, currentOtp),300); 
    clearOtpInputs(); 
    showToast('OTP sent (simulation) to ' + phone, 'success'); 
  }, 1200);
});

verifyOtpBtn.addEventListener('click', ()=>{ 
  const entered=getEnteredOtp(); 
  if(entered.length!==6){ 
    otpError.textContent='Please enter complete OTP'; 
    otpError.style.display='block'; 
    return; 
  } 
  if(entered===currentOtp){ 
    otpError.style.display='none'; 
    submitBtn.disabled=false; 
    showToast('OTP verified — you may complete registration','success'); 
  } else { 
    otpError.textContent='Invalid OTP'; 
    otpError.style.display='block'; 
    showToast('Invalid OTP','error'); 
  }
});

resendOtpBtn.addEventListener('click', async ()=>{ 
  if(!canRequestOtp()) return; 
  currentOtp = Math.floor(100000 + Math.random()*900000).toString(); 
  const phone = phoneInput.value.trim(); 
  setTimeout(()=>showSmsSimulation(phone, currentOtp),300); 
  clearOtpInputs(); 
  showToast('OTP resent (simulation)', 'info'); 
});

/* ----------------- Submit registration ----------------- */
registrationForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const code = userIdInput.value.trim();
  const name = nameInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput.value.trim();
  const aadhaar = aadhaarInput.value.trim();
  const guestType = guestTypeInput.value;

  // Validations
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('Invalid email','error'); return; }
  if(!/^[0-9]{10}$/.test(phone)){ showToast('Phone must be 10 digits','error'); return; }
  if(!/^[0-9]{12}$/.test(aadhaar)){ showToast('Aadhaar must be 12 digits','error'); return; }
  if(!imageInput.files[0]){ showToast('Please upload your photo','error'); return; }

  const codeCheck = await isValidCode(code);
  if(!codeCheck.valid){ showToast(codeCheck.message || 'Invalid code','error'); return; }

  loadingSpinner.style.display='block';
  submitBtn.disabled = true;

  let photoUrl = null;
  let canvas = null;
  let eventPassUrl = null;

  try {
    const file = imageInput.files[0];
    photoUrl = await uploadPhotoFile(file, code);

    const payload = {
      full_name: name,
      email, phone, aadhaar,
      guest_type: guestType,
      code,
      photo_url: photoUrl
    };

    const { error: insertError } = await client.from('registrations').insert([payload]).select();
    if (insertError) throw insertError;

    // Mark code as used
    await client.from('registration_codes').update({ used: true, used_by: name, used_at: new Date().toISOString() }).ilike('code', code);

    usedCodes.add(code); 
    saveUsedCodes();
    
    const serial = `SN: ${(registeredUsers.length+1).toString().padStart(3,'0')}`;
    const userData = { 
      userId: code, 
      name, email, phone, aadhaar, guestType, 
      serial, 
      registrationDate: new Date().toISOString(), 
      photo_url: photoUrl 
    };
    
    registeredUsers.push(userData); 
    saveRegisteredUsers();

    generateEventPass(userData);

    // Show pass for capture
    header.style.display = 'none';
    eventDetails.style.display = 'none';
    registrationForm.style.display = 'none';
    eventPassContainer.style.display = 'block';
    updateProgressBar(4);
    
    await new Promise(r => setTimeout(r, 500));

    // Generate high-quality pass image
    canvas = await html2canvas(document.querySelector('.event-pass'), { 
      scale: 2, 
      useCORS: true, 
      backgroundColor: null 
    });

    // Upload pass to Supabase
    eventPassUrl = await uploadEventPass(code, canvas);

    // Send email with multiple fallback options
    await sendRegistrationEmail(name, email, canvas, eventPassUrl);

    // Save pass URL to DB if available
    if (eventPassUrl) {
      await client.from('registrations').update({ event_pass_url: eventPassUrl }).eq('code', code);
    }

  } catch (err) {
    console.error('Registration error:', err);
    showToast('Registration failed. Please try again.', 'error');
  }

  loadingSpinner.style.display='none';
  submitBtn.disabled = false;
});

/* ----------------- Event pass generation & QR ----------------- */
function customizeEventPassBasedOnGuestType(guestType) {
  eventPass.classList.remove('vip-pass', 'corporate-pass', 'government-pass');
  switch (guestType) {
    case 'VIP Guest': eventPass.classList.add('vip-pass'); break;
    case 'Corporate Partner': eventPass.classList.add('corporate-pass'); break;
    case 'Government Official': eventPass.classList.add('government-pass'); break;
    default: break;
  }
}

function generateEventPass(userData){
  passName.textContent = userData.name;
  passId.textContent = userData.userId;
  passEmail.textContent = userData.email;
  passPhone.textContent = userData.phone;
  passAadhaar.textContent = userData.aadhaar;
  passGuestType.textContent = userData.guestType;
  serialNumber.textContent = userData.serial;
  customizeEventPassBasedOnGuestType(userData.guestType);
  passImage.src = userData.photo_url || uploadedImageSrc || 'https://via.placeholder.com/120x140/1a2a6c/ffffff?text=No+Image';
  generateQRCode(userData);
}

function generateQRCode(userData){
  const userDataString = `
ATIRATH HOLDINGS INDIA LIMITED
EVENT REGISTRATION DETAILS
================================
Serial No: ${userData.serial}
Name: ${userData.name}
Registration ID: ${userData.userId}
Email: ${userData.email}
Phone: ${userData.phone}
Aadhaar: ${userData.aadhaar}
Guest Type: ${userData.guestType}
--------------------------------
Event: Atirath Holdings Corporate Event
Date: November 26, 2025
Venue: Varun Novotel, Vijayawada
================================
`.trim();
  const qr = qrcode(0, 'M');
  qr.addData(userDataString);
  qr.make();
  const img = document.createElement('img');
  img.src = qr.createDataURL(4);
  qrCode.innerHTML = '';
  qrCode.appendChild(img);
  qrCodeDataURL = img.src;
}

/* ----------------- Download pass ----------------- */
downloadBtn.addEventListener('click', async () => {
  loadingSpinner.style.display = 'block';
  downloadBtn.disabled = true;

  try {
    const canvas = await html2canvas(document.querySelector('.event-pass'), { 
      scale: 2, 
      useCORS: true, 
      backgroundColor: null 
    });

    // Download locally
    const localURL = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = localURL;
    a.download = `Atirath_Event_Pass_${passId.textContent}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Upload to storage if not already done
    const eventPassUrl = await uploadEventPass(passId.textContent, canvas);
    if (eventPassUrl) {
      await client.from('registrations').update({ event_pass_url: eventPassUrl }).eq('code', passId.textContent);
      showToast("Event pass uploaded & downloaded!", "success");
    } else {
      showToast("Downloaded successfully!", "success");
    }
  } catch (err) {
    console.error('Download error:', err);
    showToast('Error generating/downloading pass', 'error');
  }

  loadingSpinner.style.display = 'none';
  downloadBtn.disabled = false;
});

/* ----------------- Back button ----------------- */
backBtn.addEventListener('click', ()=> {
  eventPassContainer.style.display = 'none';
  header.style.display = 'block';
  eventDetails.style.display = 'block';
  registrationForm.style.display = 'block';
  registrationForm.reset();
  
  // Clear all error messages
  userIdError.style.display='none'; 
  userIdSuccess.style.display='none';
  document.getElementById('emailError').style.display='none'; 
  document.getElementById('phoneError').style.display='none';
  document.getElementById('aadhaarError').style.display='none'; 
  document.getElementById('nameError').style.display='none';
  document.getElementById('guestTypeError').style.display='none'; 
  imageError.style.display='none';
  
  otpSection.style.display='none'; 
  submitBtn.disabled=true; 
  previewContainer.style.display='none'; 
  uploadedImageSrc='';
  
  goToStep(1);
  showToast('Ready for next registration', 'info');
});

/* ----------------- Init ----------------- */
function init(){
  loadFormProgress();
  setupOtpInputs();
  setupRealTimeValidation();
  updateProgressBar(1);
  if(registeredUsers.length>0) exportDataBtn.style.display='block';
}

function setupRealTimeValidation(){
  const fields = [
    { element: userIdInput, validator: validateUserId },
    { element: nameInput, validator: validateName },
    { element: emailInput, validator: validateEmail },
    { element: phoneInput, validator: validatePhone },
    { element: aadhaarInput, validator: validateAadhaar },
    { element: guestTypeInput, validator: validateGuestType }
  ];
  fields.forEach(f=> f.element.addEventListener('input', debounce(function(){ f.validator.call(this); saveFormProgress(); }, 300)));
}

document.addEventListener('DOMContentLoaded', init);
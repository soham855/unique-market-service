import {useEffect,useState} from 'react'
import './i18n.css'

const translations={
  'Sign in':'साइन इन','Access the Service Management control center.':'सर्व्हिस मॅनेजमेंट कंट्रोल सेंटरमध्ये प्रवेश करा.','Email':'ईमेल','Password':'पासवर्ड','Signing in…':'साइन इन होत आहे…','Unable to sign in':'साइन इन करता आले नाही','Loading…':'लोड होत आहे…','Profile setup required':'प्रोफाइल सेटअप आवश्यक आहे','Sign out':'साइन आउट','Loading profile…':'प्रोफाइल लोड होत आहे…','Instant Services for Your Security':'तुमच्या सुरक्षेसाठी झटपट सेवा','Secure Service Portal':'सुरक्षित सेवा पोर्टल','SECURE SERVICE PORTAL':'सुरक्षित सेवा पोर्टल','LIVE':'लाईव्ह','Your complete CCTV & security service command center. Everything you need, right at your fingertips.':'तुमच्या CCTV आणि सुरक्षा सेवांसाठी संपूर्ण कमांड सेंटर. आवश्यक सर्व सुविधा एकाच ठिकाणी.','QUICK ACTIONS':'जलद कृती','Dashboard':'डॅशबोर्ड','Admin Dashboard':'ॲडमिन डॅशबोर्ड','Technician Dashboard':'टेक्निशियन डॅशबोर्ड','Customer Dashboard':'ग्राहक डॅशबोर्ड','Reports':'रिपोर्ट्स','Business performance and service insights':'व्यवसाय कामगिरी आणि सेवा अहवाल','Complaints':'तक्रारी','Manage and track customer complaints':'ग्राहक तक्रारी व्यवस्थापित व ट्रॅक करा','Customers':'ग्राहक','View and manage customer records':'ग्राहक रेकॉर्ड पहा व व्यवस्थापित करा','Technicians':'टेक्निशियन','Manage technician assignments and work':'टेक्निशियन असाइनमेंट व काम व्यवस्थापित करा','User Accounts':'यूजर अकाउंट्स','Create and manage portal accounts':'पोर्टल अकाउंट्स तयार व व्यवस्थापित करा','Payments':'पेमेंट्स','Track customer payments and collections':'ग्राहक पेमेंट्स व कलेक्शन ट्रॅक करा','Products':'प्रॉडक्ट्स','Manage CCTV and IT products':'CCTV व IT प्रॉडक्ट्स व्यवस्थापित करा','AMC':'AMC','Manage AMC contracts and renewals':'AMC करार व नूतनीकरण व्यवस्थापित करा','Settings':'सेटिंग्स','Configure portal settings':'पोर्टल सेटिंग्स कॉन्फिगर करा','My Assigned Complaints':'माझ्या असाइन केलेल्या तक्रारी','View complaints assigned to you':'तुम्हाला असाइन केलेल्या तक्रारी पहा','Find Complaint':'तक्रार शोधा','Search and manage service tickets':'सर्व्हिस तिकीट शोधा व व्यवस्थापित करा',"Today's Visits":'आजच्या भेटी','View your scheduled service visits':'आजच्या नियोजित सेवा भेटी पहा','Raise Request':'रिक्वेस्ट पाठवा','Send a support request to Admin':'ॲडमिनला सपोर्ट रिक्वेस्ट पाठवा','Service History':'सेवा इतिहास','Review your completed service work':'पूर्ण झालेल्या सेवा कामांचा इतिहास पहा','Collect Payment':'पेमेंट कलेक्ट करा','Collect cash or UPI payment':'कॅश किंवा UPI पेमेंट कलेक्ट करा','Raise Complaint':'तक्रार नोंदवा','Get CCTV & security support quickly':'CCTV आणि सुरक्षा सपोर्ट पटकन मिळवा','My Complaints':'माझ्या तक्रारी','Track your service tickets':'तुमच्या सर्व्हिस तिकीटचा स्टेटस ट्रॅक करा','AMC Details':'AMC तपशील','Check AMC coverage and contract':'AMC कव्हरेज व करार तपासा','View payments and transaction details':'पेमेंट्स व व्यवहार तपशील पहा','My Profile':'माझे प्रोफाइल','Manage your technician profile':'तुमचे टेक्निशियन प्रोफाइल व्यवस्थापित करा','Manage your customer profile':'तुमचे ग्राहक प्रोफाइल व्यवस्थापित करा','CCTV & Surveillance':'CCTV आणि सर्व्हेलन्स','CCTV Installation':'CCTV इंस्टॉलेशन','CCTV Service & AMC':'CCTV सेवा आणि AMC','Computer & IT Solutions':'कॉम्प्युटर आणि IT सोल्यूशन्स','Networking Solutions':'नेटवर्किंग सोल्यूशन्स','Security Infrastructure':'सुरक्षा इन्फ्रास्ट्रक्चर','CCTV Camera Dealer in Ichalkaranji':'इचलकरंजीतील CCTV कॅमेरा डीलर','CCTV Installation in Ichalkaranji':'इचलकरंजीतील CCTV इंस्टॉलेशन','CCTV Service in Ichalkaranji':'इचलकरंजीतील CCTV सेवा','CCTV AMC in Ichalkaranji':'इचलकरंजीतील CCTV AMC','Computer Sales & Service in Ichalkaranji':'इचलकरंजीतील कॉम्प्युटर सेल्स आणि सर्व्हिस','Professional site survey, camera placement, cabling, networking, configuration and commissioning.':'प्रोफेशनल साइट सर्व्हे, कॅमेरा प्लेसमेंट, केबलिंग, नेटवर्किंग, कॉन्फिगरेशन आणि कमिशनिंग.','Preventive maintenance, troubleshooting and Annual Maintenance Contract support for surveillance systems.':'सर्व्हेलन्स सिस्टमसाठी प्रिव्हेंटिव्ह मेंटेनन्स, ट्रबलशूटिंग आणि AMC सपोर्ट.','Computer sales, setup, Windows support, troubleshooting and IT infrastructure assistance.':'कॉम्प्युटर सेल्स, सेटअप, Windows सपोर्ट, ट्रबलशूटिंग आणि IT इन्फ्रास्ट्रक्चर मदत.','Reliable wired and wireless networking for homes, offices and business environments.':'घर, ऑफिस आणि व्यवसायासाठी विश्वासार्ह वायर्ड आणि वायरलेस नेटवर्किंग.','Integrated security infrastructure designed around your site, coverage requirements and budget.':'तुमच्या साइट, कव्हरेज गरजा आणि बजेटनुसार तयार केलेले इंटिग्रेटेड सुरक्षा इन्फ्रास्ट्रक्चर.','Get in touch':'संपर्क करा','Quick Enquiry':'क्विक चौकशी','Name':'नाव','Company Name':'कंपनीचे नाव','Mobile':'मोबाईल','City':'शहर','State':'राज्य','Pincode':'पिनकोड','Submit Enquiry':'चौकशी पाठवा','Back to Dashboard':'डॅशबोर्डवर परत जा','Signed in as':'साइन इन केले आहे','This module is not available yet. Please use a supported dashboard action.':'हे मॉड्यूल अद्याप उपलब्ध नाही. कृपया उपलब्ध डॅशबोर्ड कृती वापरा.','CCTV & security service command center':'CCTV आणि सुरक्षा सेवा कमांड सेंटर'
}
const reverse=Object.fromEntries(Object.entries(translations).map(([en,mr])=>[mr,en]))

function translateString(value,language){
  if(!value)return value
  const table=language==='mr'?translations:reverse
  return table[value.trim()]||value
}

function translateDocument(language){
  if(typeof document==='undefined')return
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT)
  const nodes=[]
  while(walker.nextNode())nodes.push(walker.currentNode)
  nodes.forEach(node=>{
    const parent=node.parentElement
    if(!parent||parent.closest('[data-i18n-skip]'))return
    const next=translateString(node.nodeValue,language)
    if(next!==node.nodeValue)node.nodeValue=next
  })
  document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(el=>{
    if(el.closest('[data-i18n-skip]'))return
    const next=translateString(el.getAttribute('placeholder'),language)
    if(next!==el.getAttribute('placeholder'))el.setAttribute('placeholder',next)
  })
  document.documentElement.lang=language==='mr'?'mr':'en'
}

export function LanguageProvider({children}){
  const [language,setLanguage]=useState(()=>localStorage.getItem('unique-market-language')||'en')
  useEffect(()=>{
    localStorage.setItem('unique-market-language',language)
    const run=()=>translateDocument(language)
    run()
    const observer=new MutationObserver(()=>run())
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['placeholder']})
    return()=>observer.disconnect()
  },[language])
  return <LanguageContext.Provider value={{language,setLanguage}}>{children}</LanguageContext.Provider>
}

import {createContext,useContext} from 'react'
const LanguageContext=createContext({language:'en',setLanguage:()=>{}})
export function useLanguage(){return useContext(LanguageContext)}

export function LanguageSwitcher(){
  const {language,setLanguage}=useLanguage()
  return <div className='language-switcher' data-i18n-skip='true' aria-label='Language selector'>
    <button type='button' className={language==='en'?'active':''} onClick={()=>setLanguage('en')}>English</button>
    <span>/</span>
    <button type='button' className={language==='mr'?'active':''} onClick={()=>setLanguage('mr')}>मराठी</button>
  </div>
}

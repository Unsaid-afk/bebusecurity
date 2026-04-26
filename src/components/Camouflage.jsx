import React from 'react';

const Camouflage = () => {
    return (
        <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', color: '#3c4043', lineHeight: '1.6' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '400', marginBottom: '24px' }}>Google Cloud Platform Terms of Service</h1>
            <p style={{ fontSize: '14px', color: '#70757a', marginBottom: '32px' }}>Last modified: April 27, 2026</p>
            
            <section style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>1. Introduction</h2>
                <p>Welcome to Google Cloud Platform. These Terms of Service (the "Agreement") are entered into by Google LLC ("Google") and the entity or person agreeing to these terms ("Customer" or "you") and govern Customer's access to and use of the Services.</p>
            </section>

            <section style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>2. Services</h2>
                <p>2.1 Data Processing. Google will provide the Services in accordance with the Agreement and the Data Processing and Security Terms (the "DPST"). Customer may use the Services to process Customer Data for its internal business purposes.</p>
                <p>2.2 Facilities. All facilities used to store and process Customer Data will adhere to reasonable security standards no less protective than the security standards at facilities where Google processes and stores its own information of a similar type.</p>
            </section>

            <section style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>3. Customer Obligations</h2>
                <p>3.1 Compliance. Customer is responsible for (a) its use of the Services, and (b) any Customer Data it provides through the Services.</p>
                <p>3.2 End Users. Customer will ensure that its End Users comply with the Agreement.</p>
            </section>

            <section style={{ marginBottom: '24px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: '500', marginBottom: '12px' }}>4. Intellectual Property</h2>
                <p>4.1 Intellectual Property Rights. Except as expressly set forth in the Agreement, the Agreement does not grant either party any rights, implied or otherwise, to the other's content or any of the other's intellectual property.</p>
            </section>

            <div style={{ marginTop: '60px', paddingTop: '20px', borderTop: '1px solid #e8eaed', fontSize: '12px', color: '#70757a' }}>
                <p>© 2026 Google LLC 1600 Amphitheatre Parkway, Mountain View, CA 94043</p>
            </div>
        </div>
    );
};

export default Camouflage;

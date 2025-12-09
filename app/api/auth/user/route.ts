// app/api/auth/user/route.ts
// This API route extracts user information from Azure App Service Authentication headers

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Azure App Service Authentication injects user info into these headers
    const principalName = request.headers.get('x-ms-client-principal-name') || '';
    const principalId = request.headers.get('x-ms-client-principal-id') || '';
    const identityProvider = request.headers.get('x-ms-client-principal-idp') || '';
    
    // Get the full principal object (base64 encoded JSON)
    const principalHeader = request.headers.get('x-ms-client-principal');
    
    let userData = {
      name: principalName,
      email: principalName, // Usually the email for AAD
      id: principalId,
      provider: identityProvider,
    };

    // If we have the full principal, decode it for more details
    if (principalHeader) {
      try {
        const decodedPrincipal = JSON.parse(
          Buffer.from(principalHeader, 'base64').toString('utf-8')
        );
        
        // Extract claims for better user info
        const claims = decodedPrincipal.claims || [];
        const emailClaim = claims.find((c: any) => 
          c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress' ||
          c.typ === 'emails' ||
          c.typ === 'preferred_username'
        );
        const nameClaim = claims.find((c: any) => 
          c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name' ||
          c.typ === 'name'
        );
        
        if (emailClaim) userData.email = emailClaim.val;
        if (nameClaim) userData.name = nameClaim.val;
      } catch (decodeError) {
        console.error('Error decoding principal:', decodeError);
      }
    }

    // If we don't have user data, user is not authenticated
    if (!userData.name && !userData.email) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      authenticated: true,
      user: userData
    });
    
  } catch (error) {
    console.error('Error fetching user info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user information' },
      { status: 500 }
    );
  }
}
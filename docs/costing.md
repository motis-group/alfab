# Glass Costing Tool - Technical Design Document

## 1. System Overview

The Glass Costing Tool is a web-based application designed to help glass manufacturers and suppliers create accurate cost estimates and price quotes for custom glass products. The system manages client relationships, stores glass specifications, and calculates prices based on various parameters.

## 2. Core Features

### 2.1 Glass Specification Management
- Comprehensive glass parameter input
- Real-time cost calculation
- Visual preview of specifications
- Template saving for common configurations

### 2.2 Client Management
- Client profile creation and management
- Client-specific pricing rules
- Quote history tracking
- Multiple contact support per client

### 2.3 Pricing Engine
- Base cost calculation
- Configurable markup rules
- Client-specific pricing adjustments
- Bulk pricing capabilities

## 3. Data Model

### 3.1 Core Entities

#### Client
```
Client {
    id: UUID
    companyName: String
    address: Address
    contacts: Contact[]
    defaultMarkup: Decimal
    createdAt: DateTime
    updatedAt: DateTime
    status: Enum(ACTIVE, INACTIVE)
    pricingRules: PricingRule[]
}
```

#### Glass Specification
```
GlassSpecification {
    id: UUID
    length: Decimal
    width: Decimal
    thickness: Decimal
    glassType: Enum(TEMPERED, LAMINATED, INSULATED, etc.)
    features: Feature[]
    processing: Processing[]
    createdAt: DateTime
    updatedAt: DateTime
}
```

#### Costing
```
Costing {
    id: UUID
    clientId: UUID
    glassSpecification: GlassSpecification
    baseCost: Decimal
    markup: Decimal
    finalPrice: Decimal
    status: Enum(DRAFT, SENT, ACCEPTED, REJECTED)
    createdAt: DateTime
    updatedAt: DateTime
    validUntil: DateTime
}
```

## 4. User Interface Design

### 4.1 Navigation Structure
```
- Dashboard
  |- New Costing
  |- Recent Costings
  |- Client Management
  |- Settings
```

### 4.2 Key Screens

#### Dashboard
- Quick actions panel
- Recent costings list (paginated)
- Performance metrics
- Client activity feed

#### Costing Creation
1. Client Selection
   - Quick search
   - Recent clients
   - New client creation
   
2. Specification Form
   - Progressive disclosure based on glass type
   - Real-time validation
   - Dynamic cost preview
   
3. Price Calculation
   - Cost breakdown
   - Markup adjustment
   - Final price display

#### Client Management
- Client list with filters
- Individual client profiles
- Quote history
- Pricing rule configuration

## 5. Business Logic

### 5.1 Cost Calculation
Base cost calculation follows the formula:
1. Material cost (based on dimensions and type)
2. Processing costs
3. Feature costs
4. Minimum order requirements
5. Volume discounts

### 5.2 Markup Rules
- Standard markup percentage
- Client-specific adjustments
- Volume-based scaling
- Special pricing agreements

### 5.3 Quote Lifecycle
```
DRAFT -> SENT -> (ACCEPTED | REJECTED | EXPIRED)
```

## 6. Technical Architecture

### 6.1 Frontend
- React.js application
- Material UI components
- Redux state management
- Form validation using Formik
- Real-time calculations

### 6.2 Backend
- RESTful API
- Authentication/Authorization
- Data validation
- Business logic implementation
- Caching strategy

### 6.3 Database
- PostgreSQL
- Indices on frequently queried fields
- Audit logging
- Backup strategy

## 7. Security Considerations

### 7.1 Authentication
- JWT-based authentication
- Role-based access control
- Session management

### 7.2 Data Protection
- Encryption at rest
- Secure transmission
- Regular security audits
- Backup and recovery procedures

## 8. Performance Considerations

### 8.1 Optimization Strategies
- Client-side caching
- API response optimization
- Database query optimization
- Asset optimization

### 8.2 Scalability
- Horizontal scaling capability
- Load balancing
- Database replication
- Caching layers

## 9. Future Considerations

### 9.1 Potential Extensions
- Mobile application
- Offline capabilities
- Integration with accounting software
- Automated order processing
- Historical price trending
- Inventory management

### 9.2 Integration Points
- ERP systems
- Accounting software
- CRM systems
- Manufacturing systems

## 10. Implementation Phases

### Phase 1: Core Features
- Basic client management
- Simple glass specification
- Cost calculation
- Quote generation

### Phase 2: Enhanced Features
- Advanced pricing rules
- Template management
- Bulk operations
- Enhanced reporting

### Phase 3: Integration & Optimization
- Third-party integrations
- Performance optimization
- Advanced analytics
- Mobile support